var cli = require('cli');
var inquirer = require("inquirer");
var Cognitive = require("./cognitive");
var _cognitive = new Cognitive();

/**
 * @description workround for async/await operation
 *
 */
async function AsyncFunctionWrap() {

    var project = await _cognitive.SelectProjectOrCreateNew();
    var _PROJECT_ID = project.projectid;
    if (!project.newproject) {
        let _answer = await inquirer.prompt({
            name: "confirm2cleanup",
            type: "confirm",
            message: "Reupload image files?",
            default: true
        });
        if (_answer["confirm2cleanup"]) {
            await _cognitive.Cleanup(_PROJECT_ID);
            await _cognitive.UploadImages(_PROJECT_ID);
        }
    } else {
        await _cognitive.Cleanup(_PROJECT_ID);
        await _cognitive.UploadImages(_PROJECT_ID);
    }

    let _answer = await inquirer.prompt({
        name: "confirm2train",
        type: "confirm",
        message: "Training now?",
        default: true
    });
    if (_answer["confirm2train"]) {
        await _cognitive.Training(_PROJECT_ID);
    }
    cli.info("Done! ");
}



AsyncFunctionWrap();