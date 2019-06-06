var dotenv = require('dotenv');
var cli = require('cli');
var _Config = require("./config");
var TrainingApiClient = require('@azure/cognitiveservices-customvision-training').TrainingAPIClient;
var inquirer = require("inquirer");
var _ = require("lodash");
var fs = require("fs");
var path = require("path");
var util = require('util');
var Table = require('easy-table');

class Cognitive {

    constructor() {
        this.CheckEnvironment();
        this._Client = new TrainingApiClient(process.env.TRAINING_KEY, _Config.TRAINING_ENDPOINT);
        this._ImageFileExt = [".jpg", ".jpeg", ".png", ".bmp", ".gif"];
        this.setTimeoutPromise = util.promisify(setTimeout);
    }


    /**
     * @description Check TRAINING_KEY
     *
     */
    CheckEnvironment() {
        dotenv.config({
            path: './.env' + (process.env.NODE_ENV ? '.' + process.env.NODE_ENV : '')
        });

        if (!process.env.TRAINING_KEY) {
            cli.error('Please set TRAINING_KEY in enviroment or .env file.');
            process.exit();
        }

    }


    /**
     * Select a project
     *
     * @returns Project ID
     * @memberof Cognitive
     */
    async SelectProject() {
        let _projects = await this._Client.getProjects();
        if (_projects.length > 0) {
            let _projectlist = _.map(_projects, (p) => {
                return {
                    name: p.name,
                    value: p.id
                }
            });
            let _answer = await inquirer.prompt({
                name: "selectproject",
                type: "list",
                message: "Select a project:",
                choices: _projectlist
            });
            return _answer["selectproject"];
        } else {
            return undefined;
        }
    }


    /**
     * select an iteration
     *
     * @param {strting} _projectid
     * @returns iteration id
     * @memberof Cognitive
     */
    async SelectIteration(_projectid) {
        let _iterations = await this._Client.getIterations(_projectid);
        if (_iterations.length > 0) {
            let _iterationslist = _.map(_iterations, (p) => {
                return {
                    name: p.name,
                    value: p.id
                }
            });
            let _answer = await inquirer.prompt({
                name: "selectiteration",
                type: "list",
                message: "Select an iteration:",
                choices: _iterationslist
            });
            return _answer["selectiteration"];
        } else {
            return undefined;
        }
    }


    /**
     * @description select or create project
     * @returns project id
     */
    async SelectProjectOrCreateNew() {
        let _projects = await this._Client.getProjects();
        if (_projects.length > 0) {
            let _projectlist = _.map(_projects, (p) => {
                return {
                    name: p.name,
                    value: p.id
                }
            });
            _projectlist.push({
                name: "CREATE NEW PROJECT",
                value: "NEW"
            });
            let _answer = await inquirer.prompt({
                name: "selectproject",
                type: "list",
                message: "Select a project or CREATE NEW:",
                choices: _projectlist
            });
            if (_answer["selectproject"] == "NEW") {
                return {
                    projectid: await this.CreateProject(),
                    newproject: true
                };
            } else {
                return {
                    projectid: _answer["selectproject"],
                    newproject: false
                };
            }
        } else {
            return {
                projectid: await this.CreateProject(),
                newproject: true
            };
        }
    }

    /**
     * @description create a new project
     *
     * @returns project id
     */
    async CreateProject() {
        let _domains = await this._Client.getDomains();
        let _domainlist = _.map(_domains, (d) => {
            return {
                name: d.name,
                value: d.id
            }
        });
        let _answer = await inquirer.prompt([{
                name: "projectname",
                type: "input",
                message: "Project name:",
                default: "Custom Vision Project",
            },
            {
                name: "projectdesc",
                type: "input",
                message: "Project description:"
            },
            {
                name: "projectdomain",
                type: "list",
                message: "Please select project domain:",
                choices: _domainlist
            },
            {
                name: "projectclassification",
                type: "list",
                message: "Please select project classification type:",
                choices: [{
                    name: "Multiclass (Single tag per image)",
                    value: "Multiclass"
                }, {
                    name: "Multilabel (Multiple tags per image)",
                    value: "Multilabel"
                }]
            }
        ]);
        let _project = await this._Client.createProject(_answer["projectname"], {
            description: _answer["projectdesc"],
            domainId: _answer["projectdomain"],
            classificationType: _answer["projectclassification"]
        });
        return _project.id;
    }


    /**
     * Clean up tags and images on the server
     *
     * @param {string} _projectid Project ID
     * @memberof Cognitive
     */
    async Cleanup(_projectid) {

        cli.info("Deleting legacy tags from server:")
        var _tags = await this._Client.getTags(_projectid);
        for (var i = 0; i < _tags.length; i++) {
            cli.progress((i + 1) / _tags.length);
            await this._Client.deleteTag(_projectid, _tags[i].id);
        }

        cli.info("Deleting legacy images from server:")
        var _imgCount = (await this._Client.getUntaggedImageCount(_projectid)).body;
        var _deleteFlag = 0;
        while ((await this._Client.getUntaggedImageCount(_projectid)).body > 0) {
            var _images = await this._Client.getUntaggedImages(_projectid);
            await this._Client.deleteImages(_projectid, _.map(_images, "id"));
            _deleteFlag += _images.length;
            cli.progress(_deleteFlag / _imgCount);
        }

    }


    /**
     * Create tags and upload image files
     *
     * @param {string} _projectid Project ID
     * @memberof Cognitive
     */
    async UploadImages(_projectid) {
        let _base_folder = path.resolve(process.cwd(), _Config.TRAINING_FOLDER);
        var _local_tags = await fs.readdirSync(_base_folder);
        for (var _dirname of _local_tags) {
            var _dirfullname = path.resolve(_base_folder, _dirname);
            var _dirstat = await fs.statSync(_dirfullname);
            if (_dirstat.isDirectory()) {
                cli.info("Create tag '" + _dirname + "' and uploading images");
                var _tag = await this._Client.createTag(_projectid, _dirname);
                var _images = await fs.readdirSync(_dirfullname);
                var _fileCount = _images.length;
                var _fileFlag = 0;
                for (var _imagename of _images) {
                    _fileFlag++;
                    var _imagefullname = path.resolve(_dirfullname, _imagename);
                    var _imagestat = await fs.statSync(_imagefullname);
                    var _extname = path.extname(_imagename).toLowerCase();
                    if (_imagestat.isFile() && this._ImageFileExt.indexOf(_extname) >= 0) {
                        await this._Client.createImagesFromData(_projectid, fs.readFileSync(_imagefullname), { "tagIds": [_tag.id] });
                        cli.progress(_fileFlag / _fileCount);
                    }
                }
                cli.progress(1);
            }
        }
    }


    async GetDownloads(_projectid, _iterationid, _platform, _flavor) {
        cli.spinner("Exporting......");

        let exs = await this._Client.getExports(_projectid, _iterationid);
        let _p = _platform;
        let _f = null;

        if (_flavor) {
            _f = _flavor;
        }

        let ex = _.find(exs, { platform: _p, flavor: _f });
        if (ex) {
            while (ex.status == "Exporting") {
                await this.setTimeoutPromise(_Config.SLEEPTIMEOUT, null);
                exs = await this._Client.getExports(_projectid, _iterationid);
                ex = _.find(exs, { platform: _p, flavor: _f });
            }
        } else {
            // 
            ex = await this._Client.exportIteration(_projectid, _iterationid, _platform, { flavor: _flavor });
            while (ex.status == "Exporting") {
                await this.setTimeoutPromise(_Config.SLEEPTIMEOUT, null);
                exs = await this._Client.getExports(_projectid, _iterationid);
                ex = _.find(exs, { platform: _p, flavor: _f });
            }
        }
        cli.spinner("Export finished.", true);
        if (ex.status == "Done") {
            return ex.downloadUri;
        } else {
            return undefined;
        }
    }



    /**
     * Quicktest an imagefile
     *
     * @param {string} _projectid Project ID
     * @param {string} _iterationid Iteration ID
     * @param {*} _imagefullname Image file name
     * @returns test result or undefined for error
     * @memberof Cognitive
     */
    async QuickTest(_projectid, _iterationid, _imagefullname) {
        try {
            cli.info("Test:" + _imagefullname);
            var _testresult = await this._Client.quickTestImage(_projectid, fs.readFileSync(_imagefullname), { iterationId: _iterationid });
            return _testresult;
        } catch (error) {
            console.info(error.message);
            return undefined;
        }
    }

    /**
     * Training images
     *
     * @param {string} _projectid
     * @returns Iteration or undefined(not save the iteration)
     * @memberof Cognitive
     */
    async Training(_projectid) {
        cli.spinner("Training......");
        let trainingIteration = await this._Client.trainProject(_projectid, {
            forceTrain: true
        });

        while (trainingIteration.status == "Training") {
            await this.setTimeoutPromise(_Config.SLEEPTIMEOUT, null);
            trainingIteration = await this._Client.getIteration(_projectid, trainingIteration.id)
        }
        cli.spinner("Training finished.", true);

        var _perform = await this._Client.getIterationPerformance(_projectid, trainingIteration.id);

        console.info("\nPerformance by tag:");
        var t = new Table();

        _perform.perTagPerformance.forEach(function(tag) {
            t.cell('Tag', tag.name);
            t.cell('Precision', ((tag.precision == 1) ? "100" : (tag.precision * 100).toFixed(2)) + "%", Table.padLeft);
            t.cell('Recall', ((tag.recall == 1) ? "100" : (tag.recall * 100).toFixed(2)) + "%", Table.padLeft);
            t.cell('AP', ((tag.averagePrecision == 1) ? "100" : (tag.averagePrecision * 100).toFixed(2)) + "%", Table.padLeft);
            t.newRow();
        });
        console.log(t.toString())

        console.info("\nAverage performance:");
        console.info("        Precision : " + ((_perform.precision == 1) ? "100" : (_perform.precision * 100).toFixed(2)) + "%");
        console.info("        Recall    : " + ((_perform.recall == 1) ? "100" : (_perform.recall * 100).toFixed(2)) + "%");
        console.info("        AP        : " + ((_perform.averagePrecision == 1) ? "100" : (_perform.averagePrecision * 100).toFixed(2)) + "%\n");

        let _answer = await inquirer.prompt([{
            name: "confirm2save",
            type: "confirm",
            message: "Save this training iteration?",
            default: true
        }, {
            name: "iterationname",
            type: "input",
            when: function(answers) {
                return answers.confirm2save;
            },
            message: "Please input a iteration name:",
            default: trainingIteration.name
        }]);
        if (_answer["confirm2save"]) {
            await this._Client.updateIteration(_projectid, trainingIteration.id, { name: _answer["iterationname"] });
            return trainingIteration.id;
        } else {
            await this._Client.deleteIteration(_projectid, trainingIteration.id);
            return undefined;
        }
    }
}


module.exports = Cognitive;