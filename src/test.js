var cli = require('cli');
var Cognitive = require("./cognitive");
var _cognitive = new Cognitive();
var path = require("path");
var fs = require("fs");
var _Config = require("./config");
var low = require('lowdb');
var FileSync = require('lowdb/adapters/FileSync');

var adapter = new FileSync(path.resolve(process.cwd(), _Config.QUICKTEST_FOLDER, 'db.json'));
var db = low(adapter);

/**
 * @description workround for async/await operation
 *
 */
async function AsyncFunctionWrap() {
    db.defaults({ testresult: [] }).write();
    var resultList = db.get('testresult');
    let _projectid = await _cognitive.SelectProject();
    if (_projectid) {
        let _iterationid = await _cognitive.SelectIteration(_projectid);
        if (_iterationid) {
            let _testfolder = path.resolve(process.cwd(), _Config.QUICKTEST_FOLDER);
            let _images = await fs.readdirSync(_testfolder);

            for (var _imagename of _images) {
                var _imagefullname = path.resolve(_testfolder, _imagename);
                var _imagestat = await fs.statSync(_imagefullname);
                var _extname = path.extname(_imagename).toLowerCase();
                if (_imagestat.isFile() && _cognitive._ImageFileExt.indexOf(_extname) >= 0) {
                    let r = await _cognitive.QuickTest(_projectid, _iterationid, _imagefullname);
                    r["filename"] = _imagename;
                    if (r) {
                        console.info(JSON.stringify(r, undefined, 2));
                        resultList.push(r).write();
                    }

                }
            }
        } else {
            cli.error("No iterations in your project.");
        }
    } else {
        cli.error("No projects in your account.");
    }
}

AsyncFunctionWrap();