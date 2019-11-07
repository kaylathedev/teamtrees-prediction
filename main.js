
const credentials = require('./twitter-credentials.json');
const request = require('request-promise-native');
const cheerio = require('cheerio');
const yaml = require('js-yaml');
const fs = require('fs');
const regression = require('regression');
const twitter = require('twitter');
const moment = require('moment');

twitter.prototype.tweet = function (status) {
  var self = this;
  return new Promise(function (ok, fail) {
    self.post('statuses/update', {
      status: status
    }, function (err, tweet, response) {
      if (err) return fail(err);
      ok(tweet);
    });
  });
};

function log(text) {
  console.log(text);

  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
  }

  var logFile = '';
  if (fs.existsSync('logs/output.log')) {
    logFile = fs.readFileSync('logs/output.log');
  }
  logFile += text + '\n';
  fs.writeFileSync('logs/output.log', logFile);
}

function logError(text) {
  console.log('error:', text);

  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
  }

  var logFile = '';
  if (fs.existsSync('logs/output.log')) {
    logFile = fs.readFileSync('logs/output.log');
  }
  logFile += text + '\n';
  fs.writeFileSync('logs/output.log', logFile);

  var errorlogFile = '';
  if (fs.existsSync('logs/error.log')) {
    errorlogFile = fs.readFileSync('logs/error.log');
  }
  errorlogFile += text + '\n';
  fs.writeFileSync('logs/error.log', errorlogFile);
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function convertNumbertoHuman(number) {
  var millions = Math.floor(number / 1000000);
  var thousands = Math.floor((number - millions * 1000000) / 1000);
  var singles = Math.floor(number - millions * 1000000 - thousands * 1000);
  return millions + ' million ' + thousands + ' thousand ' + singles;
}

function convertDateToHuman(date) {
  return moment(date).format("dddd, MMMM Do YYYY, h:mm a");
}

function generateCurveFromTimeline(dictionary, config) {
  var minX;
  if (config.minX) minX = new Date(config.minX);

  // get projected end date
  var projectionData = [];
  var keys = Object.keys(dictionary);
  for (var key of keys) {
    var xValue = new Date(key).getTime();
    if (minX !== undefined) {
      if (xValue < minX) {
        continue;
      }
    }
    var yValue = dictionary[key];
    projectionData.push([xValue, yValue]);
  }
  return regression.linear(projectionData);
}

function predictXWithKnownYValue(curve, yValue, xValueStart, increment) {
  var nextXValue = xValueStart;
  while (true) {
    var result = curve.predict(nextXValue)[1];
    if (result > yValue) {
      break;
    }
    nextXValue += increment;
  }
  return nextXValue;
}

(async function () {

  var client = new twitter(credentials);

  while (true) {
    var localDate = new Date();
    try {

      const LAST_TWEET_TIME_FILENAME = 'last-tweet.txt';
      const waitTime = 1000 * 60 * 30; // 30 minutes

      var lastTweetDate = 0;
      if (fs.existsSync('last-tweet.txt')) {
        lastTweetDate = parseInt(fs.readFileSync(LAST_TWEET_TIME_FILENAME));
      }

      var req = await request('https://teamtrees.org/', {
        resolveWithFullResponse: true,
      });

      var when = new Date(req.headers.date);
      var dom = cheerio.load(req.body);
      var totalTreesTag = dom('#totalTrees')[0];
      var totalTrees = parseFloat(totalTreesTag.attribs['data-count']);

      when = when.toISOString();

      var yamlFile;
      if (fs.existsSync('team-trees-history.yaml')) {
        yamlFile = yaml.load(fs.readFileSync('team-trees-history.yaml'));
      } else {
        yamlFile = {};
      }
      yamlFile[when] = totalTrees;
      fs.writeFileSync('team-trees-history.yaml', yaml.dump(yamlFile));

      // get projected end date
      var curve = generateCurveFromTimeline(yamlFile, {
        minX: '2019-11-01 00:00:00',
      });

      var finishDate = new Date(predictXWithKnownYValue(curve, 20000000, new Date(when).getTime(), 60 * 60));

      if (lastTweetDate + waitTime < localDate.getTime()) {
        // time to tweet :-)
        var status = convertNumbertoHuman(totalTrees) + ' trees donated so far!\n\nIt is ' + convertDateToHuman(when) + '\n\nAt least 20 million trees expected by ' + convertDateToHuman(finishDate) + ' #TeamTrees';
        await client.tweet(status);
        log(localDate.toISOString() + ', tweet tweet, trees: ' + totalTrees + ', estimated completetion: ', finishDate.toISOString());
        fs.writeFileSync(LAST_TWEET_TIME_FILENAME, localDate.getTime());
      } else {
        log(localDate.toISOString() + ', trees: ' + totalTrees + ', estimated completetion: ' + finishDate.toISOString());
      }

      await sleep(1000 * 60 * 5); // 5 minutes
    } catch (error) {
      logError(localDate.toISOString() + ', ' + JSON.stringify(error));
    }
  }

})();