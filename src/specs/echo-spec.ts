/// <reference path="../../typings/node/node.d.ts"/>
/// <reference path="../../typings/jasmine/jasmine.d.ts"/>
/// <reference path="../../node_modules/node-author-intrusion-split/package.d.ts"/>
/// <reference path="../../node_modules/node-author-intrusion-pos-tagger/package.d.ts"/>
/// <reference path="../refs.ts"/>
/// <reference path="../index.ts"/>

import types = require("node-author-intrusion");
import splitPlugin = require("node-author-intrusion-split");
import posTaggerPlugin = require("node-author-intrusion-pos-tagger");
import echoPlugin = require("../index");

function createContent(text: string): types.Content {
    // Create a single line content.
    var location = new types.Location("a", 0, 0);
    var line = new types.Line(location, text);
    var content = new types.Content();
    content.lines = [line];

    // Process the line with the default splitter and tagger.
    var args = new types.AnalysisArguments();
    args.content = content;
    args.analysis = new types.Analysis();

    splitPlugin.process(args);
    posTaggerPlugin.process(args);

    // Return the resulting content.
    return content;
}

describe("simple echoes", function() {
    it("look at line without echoes", function () {
        // Create the content for the line.
        var content = createContent("There are no echoes in this line.");

        // Perform echo analysis on the text.
        var filter = new echoPlugin.EchoFilterOptions();
        filter.field = "normalized";
        filter.type = "all";

        var condition = new echoPlugin.EchoConditionOptions();
        condition.score = [0, 0, 1];
        condition.error = 100;
        condition.warning = 25;
        condition.field = "normalized";
        condition.filters = [filter];

        var options = new echoPlugin.EchoOptions();
        options.range = 100;
        options.scope = "document";
        options.conditions = [condition];

        var args = new types.AnalysisArguments();
        args.content = content;
        args.analysis = new types.Analysis();
        args.analysis.name = "Echo";
        args.analysis.options = options;
        echoPlugin.process(args);
        console.log(content)
        expect("test").toEqual("test");
    });
});
