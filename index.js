const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const csv = require('csvtojson');
const request = require('request-promise');
const path = require("path");
const stopsCSVFilePath = path.join(__dirname,'csv/stops.csv');
const stationsCSVFilePath = path.join(__dirname,'csv/stations.csv');
const northBound = "N";
const southBound = "S";
const mapDims = 0.015;
const apiKey = '5478c04ea5da79c1c75aa912a1fb9fd9';
var Promise = require('es6-promise').Promise;
// Feed Request Settings
let requestSettings = {
  method: 'GET',
  encoding: null
};
let timer;

// Train, Station Objects
let allStations = {};
let stopsObject = {};
let stationsETA = {};
let nearbyStations = {};
let nearbyStationsETA = {};
let doneParsingStation = false;
let doneParsingStops = false;

let feedObject = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1,
  A: 26, C: 26, E: 26,
  N: 16, Q: 16, R: 16, W: 16,
  B: 21, D: 21, F: 21, M: 21,
  L: 2,
  G: 31
};
let feedsToCall = {};
let feedstoCallArr = [];

let stationStrings = {
  "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "5X": "five_express",
  "6": "six", "6X": "six_express", "7": "seven", "7X": "seven_express" };

// Populate Train, Station Objects
csv()
  .fromFile(stationsCSVFilePath)
  .on('json', (obj) => {
  allStations[obj["GTFS Stop ID"]] = obj;
}).on('done', (e) => {
  doneParsingStation = true;
  start();
});

csv()
  .fromFile(stopsCSVFilePath)
  .on('json', (obj) => {
  stopsObject[obj["stop_id"]] = obj;
}).on('done', (e) => {
  doneParsingStops = true;
  start();
});

const start = () => {
  if (doneParsingStops && doneParsingStation) {
    clearTimeout(timer);
    let now = new Date();
    let updateDiv = document.querySelector('.update');
    let updateString ="Updated On: " + now.toLocaleDateString() + " at: "+ now.toLocaleTimeString();
    let child = updateDiv.firstChild;

    // Add Update String, replace if already created
    let header = document.createElement("div");
    header.classList.add("headerText");
    header.innerText = updateString;

    if (!child) {
      updateDiv.append(header);
    } else{
      updateDiv.replaceChild(header, child);
    }
    updateDiv.classList.add("fade");

    fetch('http://ip-api.com/json')
      .then((resp) => resp.json())
      .then((data) => {
      getNearbyStations(data);
    });
    timer = setTimeout(start, 60000);
  }
};

// Populate nearbyStations Object
const getNearbyStations = (data) => {
  for (let id in allStations) {
    if (allStations.hasOwnProperty(id)) {
      let stationLat = parseFloat(allStations[id]["GTFS Latitude"]);
      let stationLong = parseFloat(allStations[id]["GTFS Longitude"]);
      if (distance(data.lat, data.lon, stationLat, stationLong) <= 1){
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
  }
  getRoutes();
};

// Populate Feeds Array
const getRoutes = () => {
  feedsToCall = {};
  feedstoCallArr = [];
  let feedStr = "";
  for (let key in nearbyStations) {
    if (nearbyStations.hasOwnProperty(key)) {
      feedStr += nearbyStations[key]["Daytime Routes"] + " ";
    }
  }

  for (let i = 0, l = feedStr.length; i < l; i += 2) {
    let routeLetter = feedStr[i];
    let feedId = feedObject[routeLetter];

    if (feedsToCall[feedId] === undefined && feedId !== '7') {
      feedsToCall[feedId] = true;
      feedstoCallArr.push(feedId);
    }
  }
  getIncomingTrains(feedstoCallArr);
};

// Populate nearbyStationsETA
const getIncomingTrains = (arr) => {
  let promises = [];
  for (let i = 0, l = arr.length; i < l; i++) {
    requestSettings['url'] = `http://datamine.mta.info/mta_esi.php?key=${apiKey}&feed_id=${arr[i]}`;
    promises.push(request(requestSettings));
  }

  // Parse data upon receival of all promises
  Promise.all(promises).then((items) => {
    for (let i = 0, l = items.length; i < l; i++) {
      try {
        let trains = GtfsRealtimeBindings.FeedMessage.decode(items[i]);
        parseTrains(trains);
      } catch (e) {
        displayError();
        console.log("Unable to process all requests");
      }
    }
  }).catch((error) => {
    clearTimeout(timer);
    timer = setTimeout(start, 5000);
    clearDOM();
  }).then(() => {
    let loader = document.querySelector('.loader');
    loader.classList.remove("hidden");
    display();
  });
};

const parseTrains = (trains) => {
  trains.entity.forEach((train) => {

    // If train has scheduled stops
    if (train.trip_update) {
      let nextStops = train.trip_update.stop_time_update;

      // Iterate over all of a trains scheduled stops
      for (let i = 0, l = nextStops.length; i < l; i++) {
        let route = train.trip_update.trip.route_id;
        let stop = nextStops[i];
        let stationId = stop.stop_id;
        let formattedStationID = stationId.slice(0, -1);
        let destination = nextStops[nextStops.length - 1];
        let stopName;

        // Some stops on MTA CSV serve multiple line but but do not have distinctive names
        try {
          stopName = allStations[formattedStationID]["Stop Name"];
        } catch (e) {
          stopName = "";
        }

        // Populate stationsETA object if train is scheduled to stop at a nearby stations
        if (nearbyStations[formattedStationID]) {
          populateNearByStation(stationId, stop, destination, stopName, route);
        }
      }
    }
  });
};

// Compare station times
const populateNearByStation = (station, stop, destination, stopName, route) => {
  if (stop.arrival) {
    let now = new Date();
    let arrival = new Date(stop.arrival.time.low * 1000);
    let timeInSeconds = (arrival - now) / 1000;
    let timeinMinutes = Math.floor(Number((timeInSeconds/60).toFixed(2)));
    if (timeinMinutes < 0) {
      return;
    }
    let first;
    let second;

    // Template object
    let currStationObj = {
        stopName: stopName,
        destination: stopsObject[destination.stop_id].stop_name,
        arrival: arrival,
        arrivalString: arrival.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'} ),
        etaInMinutes: timeinMinutes,
        station: station,
        route: route
    };

    // Check StationsETA Object to see if station key exists
    if (stationsETA[stopName][station]) {
      first = stationsETA[stopName][station][0];
      second = stationsETA[stopName][station][1];
    } else {
      stationsETA[stopName][station] = [];
    }

    let currArrival = currStationObj.arrival;

    if (first === undefined || currArrival < first.arrival ) {
      stationsETA[stopName][station][1] = first;
      stationsETA[stopName][station][0] = currStationObj;
    } else if (second === undefined || currArrival < second.arrival) {
      stationsETA[stopName][station][1] = currStationObj;
    }
  }
};

const display = () => {
  let item;
  let parent = document.querySelector('.display');
  let loader = document.querySelector('.loader');
  clearDOM(parent);

  for (let station in stationsETA) {
    if (stationsETA.hasOwnProperty(station)) {
      let formattedStation = station.split(/[\s-]+/).join("_").toLowerCase();
      let train = document.getElementsByClassName(`${formattedStation}`)[0];

      // If element hasn't been created
      if (train === undefined ) {
        item = document.createElement('div');
        item.classList.add("station", `${formattedStation}`);

        let stationHeader = document.createElement("div");
        stationHeader.classList.add("stationHeader");
        let stationHeaderText = document.createTextNode(station);

        stationHeader.append(stationHeaderText);
        item.appendChild(stationHeader);
        parent.append(item);
      }

      for (let stop in stationsETA[station]) {
        if (stationsETA[station].hasOwnProperty(stop)) {
          let directionDiv = document.createElement("div");
          let directionClass = stop.includes("S") ? "downtown" : "uptown";
          directionDiv.classList.add(directionClass);

          // In the event of an Uptown/Downtown div already created, then append to that
          for (let i = 0, l = item.children.length; i < l; i++) {
            let child = item.children[i];
            if (child.classList.contains("downtown") && stop.includes("S") ||
            (child.classList.contains("uptown") && stop.includes("N"))) {
              directionDiv = child;
            }
          }

          // Only add the 'Uptown' and 'Downtown' labels once
          if (item.children.length <= 2) {
            let divClass = directionDiv.className;
            let labelContainer = document.createElement("div");
            labelContainer.classList.add("direction");
            let label = document.createTextNode(divClass.charAt(0).toUpperCase() + divClass.slice(1));
            labelContainer.appendChild(label);
            directionDiv.appendChild(labelContainer);
          }

          /* Iterate over each train within the stationsETA[station][stop] array, create
          * train string element and route div element and append to uptown/Downtown div
          */
          let trainArray = stationsETA[station][stop];
          for (let i = 0, l = trainArray.length; i < l; i++) {
            let uniqueTrain = trainArray[i];
            let trainContainer = document.createElement("div");
            let routeDiv = document.createElement("div");
            let info = document.createElement("p");
            let eta = document.createElement("p");
            let divText = document.createElement("div");
            let routeDivText = document.createTextNode(`${uniqueTrain.route}`);
            divText.append(routeDivText);
            divText.classList.add("route_text");
            routeDiv.append(divText);
            trainContainer.classList.add("trainContainer");

            // Prevent classNames being numbers or capital letters
            if (stationStrings[uniqueTrain.route]) {
              uniqueTrain.route = stationStrings[uniqueTrain.route];
            } else{
              uniqueTrain.route = uniqueTrain.route.toLowerCase();
            }

            routeDiv.classList.add("route", `${uniqueTrain.route}`);

            info.classList.add("stop");
            let string = `${uniqueTrain.destination}`;
            info.innerText = string;

            let etaString = `${uniqueTrain.etaInMinutes} minutes`;
            eta.classList.add("eta");
            eta.innerText = etaString;
            trainContainer.append(routeDiv, info, eta);
            directionDiv.append(trainContainer);
          }
          item.append(directionDiv);
        }
      }
    }
  }
  loader.classList.add("hidden");
  parent.classList.add("fade");
};

const displayError = () => {
  let message = document.querySelector('.error_message');
  message.classList.remove("shown");
  message.classList.add("shown");
};

const clearDOM = (parent) => {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
};

const distance = (lat1, long1, lat2, long2) => {
  let earthRadiusInKm = 6371;
  let dLat = deg2rad(lat2-lat1);  // deg2rad below
  let dLon = deg2rad(long2-long1);
  let a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  let distanceInKm = earthRadiusInKm * c; // Distance in km
  let distanceInMiles = distanceInKm * 0.621371;
  return distanceInMiles;
};

const deg2rad = (deg) => {
  return deg * (Math.PI/180);
};
