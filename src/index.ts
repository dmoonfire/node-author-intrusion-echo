/// <reference path="./refs"/>

import types = require("node-author-intrusion");

export function process(args: types.AnalysisArguments) {
  // The important parts we have now are the "range", which determines how close
  // we compare various elements. The closer the two points are, the higher the
  // number.
  var range: number = args.analysis.options.range;

  if (!range)
  {
    args.output.writeError(
      args.analysis.name + ": options.range must be set.",
      args.content.tokens[0].location);
    return;
  }

  // The score is a quadratic function (a + bx + cx^2) that calculates a numerical
  // score based on x = range - abs(distance).
  var score: number[] = args.analysis.options.score;

  if (!range)
  {
    args.output.writeError(
      args.analysis.name + ": options.score must be set.",
      args.content.tokens[0].location);
    return;
  }

  // First get a list of list of tokens that represents the scope.
  var containers = args.content.getScopedTokens(args.analysis.scope);

  // We process each list individually, testing for echo words only within that
  // scope. This way, we can test for echo words within the entire document or
  // only within a sentence.
  for (var containerIndex in containers)
  {
    var container = containers[containerIndex];
    processContainer(args, container);
  }
}

function processContainer(args: types.AnalysisArguments, container: types.TokenContainer)
{
  // Build up a location of tokens that have the same text.
  var lookups: {[id:string]: types.Token[]} = {};

  for (var tokenIndex in container.tokens)
  {
    var token = container.tokens[tokenIndex];
    var key = token.text;

    if (!lookups[key])
    {
      lookups[key] = new Array<types.Token>();
    }

    lookups[key].push(token);
  }

  // Loop through the gathered tokens and process the ones that have two or more
  // entries.
  for (var lookupKey in lookups)
  {
    // If we have only one item, then just skip it, there is no chance it is an
    // echo word.
    var lookup = lookups[lookupKey];

    if (lookup.length < 2)
    {
      continue;
    }

    processToken(args, lookupKey, lookup);
  }
}

function processToken(
  args: types.AnalysisArguments,
  text: string,
  tokens: types.Token[])
{
  // Get the thresholds.
  var warningThreshold: number = args.analysis.options.warning;
  var errorThreshold: number = args.analysis.options.error;

  // Loop through the tokens and then filter out the list of ones that within
  // the given range.
  for (var i in tokens)
  {
    // Get the token and then get all of the tokens that are close to that range.
    // If there aren't any test tokens, then skip it.
    var token: types.Token = tokens[i];
    var testTokens = getTestTokens(args.analysis.options, token.index, tokens);

    if (testTokens.length == 0)
    {
      continue;
    }

    // Score the collection to figure out how important this is.
    var tokenScore = scoreTokens(args.analysis.options, token.index, testTokens);

    // See if we have a score multiplier. This will return 1.0 if we don't have one, so we
    // can multiply the score by it to get an adjusted score.
    var tokenMultiplier = getScoreMultiplier(args.analysis.options, token.text);

    tokenScore *= tokenMultiplier;

    // If we are under the warning threshold, we don't have to worry about it.
    if (tokenScore < warningThreshold)
    {
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

    if (tokenScore < errorThreshold)
    {
      args.output.writeWarning(message, token.location);
    }
    else
    {
      args.output.writeError(message, token.location);
    }
  }
}

function getTestTokens(options, index: number, tokens: types.Token[]): types.Token[]
{
  var range = options.range;
  var testTokens = new Array<types.Token>();

  for (var tokenIndex in tokens)
  {
    var token = tokens[tokenIndex];
    var distance = Math.abs(token.index - index);

    if (distance > 0 && distance <= range)
    {
      testTokens.push(token);
    }
  }

  return testTokens;
}

function scoreTokens(options, index: number, tokens: types.Token[]): number
{
  var range: number = options.range;
  var score: number[] = options.score;
  var tokenScore: number = 0;
  var testTokens = new Array<types.Token>();

  for (var tokenIndex in tokens)
  {
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

  if (score.length > 0)
  {
    value += score[0];
  }

  if (score.length > 1)
  {
    value += score[1] * x;
  }

  if (score.length > 2)
  {
    value += score[2] * x * x;
  }

  return value;
}

function getScoreMultiplier(options, text: string): number
{
  // If we don't have multipliers, then we're good.
  if (!options.tokens)
  {
    return 1;
  }

  // Loop through until we find the first match.
  for (var index in options.tokens)
  {
    // Figure out if we have a match.
    var multiplier = options.tokens[index];
    var type = multiplier.type;
    if (!type) { type = "exact"; }

    switch (type)
    {
      case "exact":
        if (multiplier.value === text) {
          return multiplier.multiplier;
        }
        break;

      case "regex":
        if (text.match("^" + multiplier.value + "$"))
        {
          return multiplier.multiplier;
        }
        break;

      default:
        throw new Error("Unknown token multiplier");
    }
  }

  // If we fall out of the loop, use 1.0.
  return 1;
}
