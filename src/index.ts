/// <reference path="./refs"/>

import types = require("node-author-intrusion");

export class EchoFilterOptions {
    /**
     * The field to use for searching for echoes. Acceptable variables
     * are "normalized" (default), "text", "stem", and "partOfSpeech".
     */
    field: string;

    /**
     * Contains the type of pattern matching used for tokens. Acceptable
     * values are exact" (default) or "regex". These are used to
     * determine how the field is compared against the values.
     */
    type: string;

    /**
     * Contains either a text string or a list of text strings which is
     * compared using the above type to determine a match.
     */
    values: string[];
}

export class EchoConditionOptions {
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
    // Filter out the tokens in testTokens based on the filters we have within
    // the condition. If there is no filter, then we have a placeholder "all"
    // which compared against the same field as the source.
    if (!condition.filters) {
        var filter = new EchoFilterOptions();
        filter.field = condition.field;
        filter.type = "exact";

        condition.filters = [filter]
    }

    // Filter out the tokens. If we don't have any left, then we're done.
    var filteredTokens = filterTokens(token, condition.filters, testTokens);

    if (filteredTokens.length == 0) { return; }

    // We have at least one filtered token, so calculate a score from the list.
    var tokenScore = scoreTokens(options, condition, token.index, filteredTokens);

    // Check the threshold of scores. If it is below warning, we don't have to
    // do anything with it and we can quit.
    if (tokenScore < condition.warning) { return; }

    // Build up the message to display to the user.
    var message = token.text + ": " + token[condition.field] + " was used " + filteredTokens.length
        + " other times in the surrounding " + options.range + " tokens. (Score "
        + tokenScore + ")";

    if (tokenScore >= condition.error)
    {
        output.writeError(message, token.location);
    }
    else
    {
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
            // Get the base and compare value.
            var baseValue = baseToken[filter.field];
            var testValue = testToken[filter.field];

            // Check for include/exclude values.

            // If there is a match, we include it.
            if (inFilter(filter, baseValue, testValue)) {
                filteredTokens.push(testToken);
                break;
            }
        }
    }

    // Return the resulting tokens.
    return filteredTokens;
}

function inFilter(filter: EchoFilterOptions, baseValue: string, testValue: string) {
    // The filter type determines how (or if) we compare the test value.
    switch (filter.type) {
        case "exact":
            return baseValue === testValue;
        default:
            throw new Error("Unknown echo filter type: " + filter.type + ".");
    }
}

function processToken(
    options: EchoOptions,
    text: string,
    tokens: types.Token[]) {
    /*
        // Get the thresholds.
        var warningThreshold: number = options.warning;
        var errorThreshold: number = options.error;

        // Loop through the tokens and then filter out the list of ones that within
        // the given range.
        for (var i in tokens) {
            // Get the token and then get all of the tokens that are close to that range.
            // If there aren't any test tokens, then skip it.
            var token: types.Token = tokens[i];
            var testTokens = getTestTokens(args.analysis.options, token.index, tokens);

            if (testTokens.length == 0) {
                continue;
            }


            // See if we have a score multiplier. This will return 1.0 if we don't have one, so we
            // can multiply the score by it to get an adjusted score.
            var tokenMultiplier = getScoreMultiplier(args.analysis.options, token.text);

            tokenScore *= tokenMultiplier;

            // If we are under the warning threshold, we don't have to worry about it.
            if (tokenScore < warningThreshold) {
                continue;
            }

            // Format the message we'll be showing the user.
            var message = args.analysis.name
                + ": '" + token.text + "' is echoed "
                + (testTokens.length + 1)
                + " times within "
                + args.analysis.options.range
                + " words (score "
                + tokenScore
                + ")";

            if (tokenScore < errorThreshold) {
                args.output.writeWarning(message, token.location);
            }
            else {
                args.output.writeError(message, token.location);
            }
        }
    */
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

function getScoreMultiplier(options: EchoOptions, text: string): number {
    /*
        // If we don't have multipliers, then we're good.
        if (!options.tokens) {
            return 1;
        }

        // Loop through until we find the first match.
        for (var index in options.tokens) {
            // Figure out if we have a match.
            var multiplier = options.tokens[index];
            var type = multiplier.type;
            if (!type) { type = "exact"; }

            switch (type) {
                case "exact":
                    if (multiplier.value === text) {
                        return multiplier.multiplier;
                    }
                    break;

                case "regex":
                    if (text.match("^" + multiplier.value + "$")) {
                        return multiplier.multiplier;
                    }
                    break;

                default:
                    throw new Error("Unknown token multiplier");
            }
        }

        // If we fall out of the loop, use 1.0.
    */
    return 1;
}

/*
// The score is a quadratic function (a + bx + cx^2) that calculates a numerical
// score based on x = range - abs(distance).
var score: number[] = options.score;

if (!score) {
    args.output.writeError(
        args.analysis.name + ": options.score must be set.",
        args.content.tokens[0].location);
    return;
}

// Figure out which field we'll be pulling.
var fieldName = options.field ? options.field : "normalized";


*/
