/// <reference path="../../typings/node/node.d.ts"/>
/// <reference path="../../typings/jasmine/jasmine.d.ts"/>
/// <reference path="../refs.ts"/>
/// <reference path="../index.ts"/>

import types = require("node-author-intrusion");
import plugin = require("../index");

describe("environment", function() {
    it("verify simple normalized tokens", function () {
        expect("test").toEqual("test");
    });
});
