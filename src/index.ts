/// <reference path="./refs"/>

import types = require("node-author-intrusion");
import node = require("repl");

export interface EchoIncludeOptions {
    includes: string[];
}

export class EchoFilterOptions implements EchoIncludeOptions {
    /**
     * The field to use for searching for echoes. Acceptable variables
     * are "normalized" (default), "text", "stem", and "partOfSpeech".
     */
    field: string;

    includes: string[];
}

export class EchoConditionOptions implements EchoIncludeOptions {
    score: number[];
    warning: number;
    error: number;

    /**
     * The field to use for reporting the echo. Acceptable variables
     * are "normalized" (default), "stem", and "partOfSpeech".
     */
    field: string;

    /**
     * The filters to look for. If any one matches, then it will be used for
     * the comparison.
     */
    filters: EchoFilterOptions[];

    includes: string[];
}

export class EchoOptions {
    range: number;

    /**
     * The scope of analysis. Acceptable values are "document".
     */
    scope: string;

    /**
     * Contains a list of one or more search conditions to look
     * for echos.
     */
    conditions: EchoConditionOptions[];
}

export function process(args: types.AnalysisArguments) {
    // Pull out the options and cast them.
    var options: EchoOptions = args.analysis.options;

    // The important parts we have now are the "range", which determines how close
    // we compare various elements. The closer the two points are, the higher the
    // number.
    var range: number = options.range;

    if (!range) {
        args.output.writeError(
            args.analysis.name + ": options.range must be set.",
            args.content.tokens[0].location);
        return;
    }

    // First get a list of list of tokens that represents the scope.
    var containers = args.content.getScopedTokens(options.scope);

    // We process each list individually, testing for echo words only within that
    // scope. This way, we can test for echo words within the entire document or
    // only within a sentence.
    for (var containerIndex in containers) {
        var container = containers[containerIndex];
        processContainer(args.output, options, container);
    }
}

function processContainer(output: types.AnalysisOutput, options: EchoOptions, container: types.TokenContainer) {
    // Go through each of the tokens in the container.
    for (var token of container.tokens) {
        // Get the surrounding tokens from this one. This doesn't change based
        // on the individual tests.
        var testTokens = getTestTokens(options, token.index, container.tokens);

        // Go through all the conditions, which are the echo states
        // we are searching for.
        for (var condition of options.conditions) {
            processCondition(output, options, condition, token, testTokens);
        }
    }
}

function processCondition(
    output: types.AnalysisOutput,
    options: EchoOptions,
    condition: EchoConditionOptions,
    token: types.Token,
    testTokens: types.Token[]) {
    // If we aren't processing this token, skip it.
    if (!inFilter(condition, token[condition.field])) {
        return;
    }

    // Filter out the tokens in testTokens based on the filters we have within
    // the condition. If there is no filter, then we have a placeholder "all"
    // which compared against the same field as the source.
    var filters = condition.filters;

    if (!filters) {
        var filter = new EchoFilterOptions();
        filter.field = condition.field;
        filter.includes = [token[condition.field]];
        filters = [filter]
    }

    // Filter out the tokens. If we don't have any left, then we're done.
    var filteredTokens = filterTokens(token, filters, testTokens);

    if (filteredTokens.length == 0) { return; }

    // We have at least one filtered token, so calculate a score from the list.
    var tokenScore = scoreTokens(options, condition, token.index, filteredTokens);

    // Check the threshold of scores. If it is below warning, we don't have to
    // do anything with it and we can quit.
    if (tokenScore < condition.warning) { return; }

    // Build up the message to display to the user.
    var message = token.text + ": " + token[condition.field] + " was used "
        + (filteredTokens.length + 1)
        + " times in " + options.range + " tokens. (Score "
        + tokenScore + ")";

    if (tokenScore >= condition.error) {
        output.writeError(message, token.location);
    }
    else {
        output.writeWarning(message, token.location);
    }
}

function filterTokens(baseToken: types.Token, filters: EchoFilterOptions[], tokens: types.Token[]): types.Token[] {
    // Create a list of filtered tokens, excluding ourselves.
    var filteredTokens: types.Token[] = [];

    for (var testToken of tokens) {
        // Exclude ouselves from the list.
        if (baseToken.index == testToken.index) { continue; }

        // Loop through all the filters. If we find a match, we include it. If
        // we get through all the filters without matching, we skip it.
        for (var filter of filters) {
            // If we aren't processing this token, skip it.
            if (inFilter(filter, testToken[filter.field])) {
                filteredTokens.push(testToken);
                break;
            }
        }
    }

    // Return the resulting tokens.
    return filteredTokens;
}

function inFilter(options: EchoIncludeOptions, value: string): boolean {
    // If there are no includes, it is an auto-include.
    if (!options.includes || options.includes.length == 0) {
        return true;
    }

    // Go through and see if it is a match.
    for (var include of options.includes) {
        // If the line starts and ends with a "/", then it is a regex.
        var regex: RegExp;

        if (include[0] === "/" && include[-1] === "/") {
            regex = new RegExp(include.substring(1, include.length - 2));
        }
        else {
            regex = new RegExp("^" + include + "$");
        }

        // See if it matches to the value.
        if (regex.test(value)) {
            return true;
        }
    }

    // If we get out of all the filters, it is a false.
    return false;
}

function getTestTokens(options: EchoOptions, index: number, tokens: types.Token[]): types.Token[] {
    var range = options.range;
    var testTokens = new Array<types.Token>();

    for (var tokenIndex in tokens) {
        var token = tokens[tokenIndex];
        var distance = Math.abs(token.index - index);

        if (distance > 0 && distance <= range) {
            testTokens.push(token);
        }
    }

    return testTokens;
}

function scoreTokens(options: EchoOptions, condition: EchoConditionOptions, index: number, tokens: types.Token[]): number {
    var range: number = options.range;
    var score: number[] = condition.score;
    var tokenScore: number = 0;
    var testTokens = new Array<types.Token>();

    for (var tokenIndex in tokens) {
        // Get the token and figure out how many tokens away it is from the one we're
        // testing.
        var token = tokens[tokenIndex];
        var distance = Math.abs(token.index - index);
        var offset = range - distance;

        // Calculate the score based on that value.
        var currentScore = calculateScore(score, offset);
        tokenScore += currentScore;
    }

    return tokenScore;
}

function calculateScore(score: number[], x: number): number {
    var value = 0;

    if (score.length > 0) {
        value += score[0];
    }

    if (score.length > 1) {
        value += score[1] * x;
    }

    if (score.length > 2) {
        value += score[2] * x * x;
    }

    return value;
}
