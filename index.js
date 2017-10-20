const button = document.getElementById('locate_button');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const csv = require('csvtojson');
const request = require('request');
const tripsCSVFilePath = './csv/trips.csv';
const stopsCSVFilePath = './csv/stops.csv';
const stationsCSVFilePath = './csv/stations.csv';
const northBound = "N";
const southBound = "S";
const mapDims = 0.006;
const apiKey = '5478c04ea5da79c1c75aa912a1fb9fd9';

let displayCount = 0;

/* Feed Request Settings */
let requestSettings = {
  method: 'GET',
  encoding: null
};

/* Train, Trip, Station Objects */
let allStations = {};
let stopsObject = {};
let stationsETA = {};
let doneParsingStation = false;
let doneParsingStops = false;

let nearbyStations = {};
let nearbyStationsETA = {};

let feedObject = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1,
  A: 26, C: 26, E: 26,
  N: 16, Q: 16, R: 16, W: 16,
  B: 21, D: 21, F: 21, M: 21,
  L: 2,
  G: 31
};
let feedsToCall = {};

/* Populate Train, Station Objects */
csv()
  .fromFile(stationsCSVFilePath)
  .on('json', (obj) => {
  allStations[obj["GTFS Stop ID"]] = obj;
}).on('done', (e) =>{
  doneParsingStation = true;
  start();
});

csv()
  .fromFile(stopsCSVFilePath)
  .on('json', (obj) =>{
  stopsObject[obj["stop_id"]] = obj;
}).on('done', (e) =>{
  doneParsingStops = true;
  start();
});


const start = () => {
  if(doneParsingStops && doneParsingStation){
    let now = new Date();
    $('.update').empty();
    $('.update').append(`<h3> Updated On: ${now.toLocaleDateString()} at: ${now.toLocaleTimeString()}</h3>`);
    $.get('http://ip-api.com/json',(data) => {
      getNearbyStations(data);
    });
    setTimeout(start, 60000);
  }
};



/* Populate nearbyStations Object */
const getNearbyStations = (data) => {
  // data.lat = 40.703811;
  // data.lon = -73.918425;
  for(let id in allStations){
      let stationLat = parseFloat(allStations[id]["GTFS Latitude"]);
      let stationLong = parseFloat(allStations[id]["GTFS Longitude"]);
      if ((Math.abs(stationLat - data.lat) <= mapDims) && (Math.abs(stationLong - data.lon) <= mapDims))  {
        let stopId = allStations[id]["GTFS Stop ID"];
        let northID = stopId + northBound;
        let southID = stopId + southBound;
        nearbyStations[stopId] = allStations[id];
        let stopName = allStations[id]["Stop Name"];
        stationsETA[stopName] = {};

        nearbyStationsETA[northID] = [];
        nearbyStationsETA[southID] = [];
    }
  }
  getRoutes();
};

/* Populate Feeds Array */
const getRoutes = () => {
  let feedStr = "";
  for (let key in nearbyStations) {
    feedStr += nearbyStations[key]["Daytime Routes"] + " ";
  }

  for (let i = 0;  i < feedStr.length; i += 2) {
    let routeLetter = feedStr[i];
    let feedId = feedObject[routeLetter];

    if (feedsToCall[feedId] === undefined && feedId !== '7'){
      feedsToCall[feedId] = true;
    }
  }
  displayCount = Object.keys(feedsToCall).length;
  getIncomingTrains();
};

/* Populate nearbyStationsETA */
const getIncomingTrains = () => {
  for (let feedId in feedsToCall) {
    requestSettings['url'] = `http://datamine.mta.info/mta_esi.php?key=${apiKey}&feed_id=${feedId}`;
    displayCount -= 1;
    makeRequest();
  }
};

/* Call all feeds */
const makeRequest = () => {
  let feed;
  request(requestSettings, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      feed = (GtfsRealtimeBindings.FeedMessage.decode(body));
      // iterate over all of the trains
      feed.entity.forEach((train) => {
        // if it has scheduled stops
        if(train.trip_update){
          let nextStops = train.trip_update.stop_time_update;
          // iterate over all of a trains scheduled stops
          nextStops.forEach((stop, _ ,allStops) => {
            let stationId = stop.stop_id;
            let formattedStationID = stationId.slice(0, -1);
            let destination = allStops[allStops.length - 1];
            let stopName;
            try {
              stopName = allStations[formattedStationID]["Stop Name"];
            } catch (e) {
              stopName = "";
            }
            if(nearbyStations[formattedStationID]){
              populateNearByStation(stationId, stop, destination, stopName);
            }
          });
        }
      });
    }
  });
  display();
};

/* Compare station times */
const populateNearByStation = (station, stop, destination, stopName) => {
  if (stop.arrival){
    let now = new Date();
    let arrival = new Date(stop.arrival.time.low * 1000);
    let timeInSeconds = (arrival - now) / 1000;
    let parsedTime = Number((timeInSeconds/60).toFixed(2));
    let first;
    let second;
    if (parsedTime < 0){
      return;
    }
    /* Template object */
    let currStationObj = {
        stopName: stopName,
        destination: stopsObject[destination.stop_id].stop_name,
        arrival: arrival.toLocaleTimeString(),
        station: station
    };

    /* Check StationsETA Object to see if station key exists */
    if (stationsETA[stopName][station]){
      first = stationsETA[stopName][station][0];
      second = stationsETA[stopName][station][1];
    } else {
      first = stationsETA[stopName][station] = [];
      second = stationsETA[stopName][station] = [];
    }

    let currArrival = currStationObj.arrival;

    if (first === undefined || currArrival < first.arrival ){
      stationsETA[stopName][station][1] = first;
      stationsETA[stopName][station][0] = currStationObj;
    } else if (second === undefined || currArrival < second.arrival) {
      stationsETA[stopName][station][1] = currStationObj;
    }
  }
};

const display = () => {
// sort the stations ETA here after you have them all.
    let stuff = $(".display");

  for(let key in stationsETA){
    let formattedKey = key.split(/[\s-]+/).join("_");
    let train = $(`.${formattedKey}`);
    let obj = stationsETA[key];
    let el = $(`<div class=${key}>${JSON.stringify(obj)}`);
    let item;
    if (train.length < 1){
      item = $(`<div class=${formattedKey}>${key}</div>`);
    }

    stuff.append(item);
  }
  // for(let key in nearbyStationsETA){
  //   if (train.length < 1 && nearbyStationsETA[key].length > 0){
  //     for(let i = 0; i < nearbyStationsETA[key].length; i++) {
  //       let el = $(`<div class=${key}>${JSON.stringify(nearbyStationsETA[key][i])}</div>`);
  //       el.addClass('trains');
  //       stuff.append(el).hide().fadeIn();
  //     }
  //   } else if (nearbyStationsETA[key][0] !== undefined && nearbyStationsETA[key][1] !== undefined){
  //       train[0].innerText = JSON.stringify(nearbyStationsETA[key][0]);
  //       train[1].innerText = JSON.stringify(nearbyStationsETA[key][1]);
  //     }
  //   }
};
