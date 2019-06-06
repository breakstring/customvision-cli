var cli = require('cli');
var inquirer = require("inquirer");
var Cognitive = require("./cognitive");
var _cognitive = new Cognitive();
var path = require("path");
var fs = require("fs");
var dl = require('retriable-download');
var _Config = require("./config");


/**
 * @description workround for async/await operation
 *
 */
async function AsyncFunctionWrap() {

    let _projectid = await _cognitive.SelectProject();
    if (_projectid) {
        let _iterationid = await _cognitive.SelectIteration(_projectid);
        if (_iterationid) {

            let _downloadPlatform = [{
                    name: "CoreML",
                    value: "CoreML"
                },
                {
                    name: "TensorFlow",
                    value: "TensorFlow"
                },
                {
                    name: "ONNX",
                    value: "ONNX"
                },
                {
                    name: "DockerFile",
                    value: "DockerFile"
                }
            ];

            let _onnxoption = [{
                name: "ONNX10",
                value: "ONNX10"
            }, {
                name: "ONNX12",
                value: "ONNX12"
            }];

            let _dockeroption = [{
                name: "Linux",
                value: "Linux"
            }, {
                name: "Windows",
                value: "Windows"
            }, {
                name: "ARM",
                value: "ARM"
            }];

            let _answer = await inquirer.prompt([{
                name: "selectplatform",
                type: "list",
                message: "Please select platform:",
                choices: _downloadPlatform
            }, {
                name: "selectonnx",
                type: "list",
                choices: _onnxoption,
                when: function(answers) {
                    return (answers.selectplatform == "ONNX");
                },
                message: "Please select ONNX version:",
            }, {
                name: "selectdocker",
                type: "list",
                message: "Please select Docker type:",
                choices: _dockeroption,
                when: function(answers) {
                    return (answers.selectplatform == "DockerFile");
                }
            }]);

            var _platform = _answer["selectplatform"];
            var _flavor = undefined;
            switch (_platform) {
                case "ONNX":
                    _flavor = _answer["selectonnx"];
                    break;
                case "DockerFile":
                    _flavor = _answer["selectdocker"];
                    break;
                default:
                    break;
            }
            let r = await _cognitive.GetDownloads(_projectid, _iterationid, _platform, _flavor);
            if (r) {
                cli.spinner("Downloading......");
                dl(r, 3).then((filename) => {
                    let t = new Date();
                    let _exportFile = path.resolve(process.cwd(), _Config.EXPORT_FOLDER, t.valueOf() + ".zip");
                    fs.renameSync(filename, _exportFile);
                    cli.spinner("Download finished and save to: " + _exportFile, true);
                });
            } else {
                cli.error("Something wrong...... Please check the export status in CV portal.");
            }
        } else {
            cli.error("No iterations in your project.");
        }
    } else {
        cli.error("No projects in your account.");
    }
}

AsyncFunctionWrap();