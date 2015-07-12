/// <reference path="../../typings/node/node.d.ts"/>
/// <reference path="../../typings/jasmine/jasmine.d.ts"/>
/// <reference path="../refs.ts"/>

import types = require("node-author-intrusion");

describe("environment", function() {
    it("verify test framework", function () {
        expect("test").toEqual("test");
    });

    it("can create content", function(){
        var content = new types.Content();
        expect(content.tokens.length).toEqual(0);
    })
});
