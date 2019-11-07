
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

async function scrapeTotalTrees(client) {

}
(async function () {

  var client = new twitter(credentials);

  while (true) {
    try {

      const LAST_TWEET_TIME_FILENAME = 'last-tweet.txt';
      const waitTime = 1000 * 60 * 30; // 30 minutes

      var lastTweetDate = 0;
      if (fs.existsSync('last-tweet.txt')) {
        lastTweetDate = parseInt(fs.readFileSync(LAST_TWEET_TIME_FILENAME));
      }
      var localDate = new Date();
      if (lastTweetDate + waitTime >= localDate.getTime()) {
        // not time to tweet :-(
        await sleep(1000); // prevents overloading our cpu
        continue;
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

      var status = convertNumbertoHuman(totalTrees) + ' trees donated so far!\n\nIt is ' + convertDateToHuman(when) + '\n\nAt least 20 million trees expected by ' + convertDateToHuman(finishDate);

      await client.tweet(status);
      console.log('tweet tweet at ', localDate.toLocaleString());
      fs.writeFileSync(LAST_TWEET_TIME_FILENAME, localDate.getTime());

      //await sleep(1000 * 60 * 30); // 30 minutes
    } catch (error) {
      console.log(error);
    }
  }

})();