let DATA = [];

let map = null;

let markerA01 = null;





// =============================
// LOAD DATA
// =============================


async function loadData(){


try{


const res =
await fetch("./data.json");


if(!res.ok){

throw new Error(
"data.json error"
);

}



DATA =
await res.json();



console.log(
"Loaded:",
DATA.length
);



updateDashboard();


updateMap();


updateStatistics();



}catch(e){

console.error(e);

}


}







// =============================
// COMMON
// =============================


function latest(){


return DATA.length
?
DATA[DATA.length-1]
:
null;


}



function setText(id,value){


let el =
document.getElementById(id);



if(el){

el.innerHTML=value;

}


}




function show(v,u=""){


if(v===null || v===undefined){

return "NULL";

}


return v+u;


}









// =============================
// CLOCK
// =============================


function updateClock(){


let now =
new Date();



let str =

now.getFullYear()
+"-"+
String(now.getMonth()+1).padStart(2,"0")
+"-"+
String(now.getDate()).padStart(2,"0")
+" "+
now.toLocaleTimeString();



setText(
"time",
str
);


}


setInterval(
updateClock,
1000
);








// =============================
// GPS
// =============================


function latestGPS(){


return [...DATA]

.reverse()

.find(d=>

d.x!==null &&
d.y!==null

);


}









// =============================
// REAL MAP
// =============================


function initMap(){



if(!document.getElementById(
"worldMap"
)){

return;

}



let gps =
latestGPS();



let lat =
gps?
gps.x:
0;



let lon =
gps?
gps.y:
0;




map =
L.map(
"worldMap"
)

.setView(
[
lat,
lon
],
5
);





L.tileLayer(

"https://tile.openstreetmap.org/{z}/{x}/{y}.png",

{

maxZoom:18,

attribution:
"© OpenStreetMap"

}

)

.addTo(map);






if(gps){


markerA01 =

L.marker(
[
gps.x,
gps.y
]

)

.addTo(map);



markerA01.bindPopup(

`

<b>ANT-A01</b><br>

Latitude:
${gps.x}<br>

Longitude:
${gps.y}

`

);



}



}









function updateMap(){


let gps =
latestGPS();



if(!gps){

return;

}




setText(
"latitude",
gps.x.toFixed(6)+"°"
);



setText(
"longitude",
gps.y.toFixed(6)+"°"
);



setText(
"satellites",
show(gps.n)
);





if(map===null){


setTimeout(
initMap,
300
);


}

else{


markerA01
.setLatLng(
[
gps.x,
gps.y
]
);



map.setView(

[
gps.x,
gps.y
]

);


}





let status =
gps.g==="O"
?
"ONLINE"
:
gps.g==="N"
?
"NO FIX"
:
show(gps.g);



setText(

"gpsStatusPage",

status

);



}









// =============================
// DASHBOARD
// =============================


function updateDashboard(){



let d =
latest();



if(!d){

return;

}





setText(

"systemMode",

show(d.mode)

);





setText(

"voltage",

show(d.v," V")

);



setText(

"solar",

show(d.s," W/m²")

);





setText(

"insideTemp",

show(d.t," ℃")

);



setText(

"outsideTemp",

show(d.j," ℃")

);



setText(

"current",

show(d.a," mA")

);





}





// =============================
// STATISTICS
// =============================


function updateStatistics(){



if(DATA.length===0){

return;

}




let first =
new Date(
DATA[0].time
);



let last =
new Date(
DATA[DATA.length-1].time
);



let days =

Math.floor(

(last-first)

/

(1000*60*60*24)

);



console.log(
"days:",
days
);



setText(

"runDays",

days

);



setText(

"dataCount",

DATA.length

);



setText(

"lastUpdate",

DATA[DATA.length-1].time

);



}









// =============================
// START
// =============================


window.onload=function(){


updateClock();


loadData();


};
