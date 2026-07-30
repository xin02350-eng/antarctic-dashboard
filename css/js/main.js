let DATA=[];

let trendChart=null;



// ==========================
// LOAD JSON
// ==========================

async function loadData(){

try{


const res =
await fetch("../data.json");


DATA =
await res.json();



updateDashboard();

updateLocation();

updateSensors();

updateTelemetry();

createTrendChart();


}

catch(e){

console.error(
"DATA ERROR:",
e
);

}

}







// ==========================
// FORMAT
// ==========================

function show(v,unit=""){


if(v===null || v===undefined){

return "NULL";

}


return v+unit;


}







function latest(){


if(DATA.length===0)

return null;



return DATA[DATA.length-1];


}









// ==========================
// GPS ONLY
// 最近有效
// ==========================

function latestGPS(){


return [...DATA]

.reverse()

.find(d=>

d.x!==null &&

d.y!==null

);


}









// ==========================
// BATTERY
// ==========================


function battery(v){


if(v===null || v===undefined)

return "NULL";



if(v>=12.7)

return 100;



if(v>=12.5)

return 85;



if(v>=12.3)

return 65;



if(v>=12.1)

return 45;



if(v>=11.9)

return 25;



return 10;


}









// ==========================
// DASHBOARD
// ==========================


function updateDashboard(){


let d=latest();


if(!d)return;





document.getElementById(
"currentTemp"
).innerHTML=

show(d.t," ℃");





document.getElementById(
"voltage"
).innerHTML=

show(d.v," V");





let soc=battery(d.v);



document.getElementById(
"batterySOC"
).innerHTML=

soc==="NULL"

?

"NULL"

:

soc+"%";





if(soc!=="NULL")

document.getElementById(
"batteryProgress"
).style.width=

soc+"%";





document.getElementById(
"current"
).innerHTML=

show(d.a);




document.getElementById(
"solar"
).innerHTML=

show(d.s);




document.getElementById(
"insideTemp"
).innerHTML=

show(d.t);




document.getElementById(
"insideHum"
).innerHTML=

show(d.h);




document.getElementById(
"outsideTemp"
).innerHTML=

show(d.j);



}









// ==========================
// LOCATION
// ==========================


function updateLocation(){


let d=latestGPS();


if(!d)return;




let ids=[

["latitude",d.x],
["longitude",d.y],
["latitudePage",d.x],
["longitudePage",d.y]

];



ids.forEach(item=>{


let el=document.getElementById(item[0]);


if(el)

el.innerHTML=

item[1].toFixed(6)+"°";


});






let sat=document.getElementById(
"satellites"
);



if(sat)

sat.innerHTML=

show(d.n);





let sat2=document.getElementById(
"satellitesPage"
);



if(sat2)

sat2.innerHTML=

show(d.n);





let gps=document.getElementById(
"gpsStatusPage"
);



if(gps)

gps.innerHTML=

show(d.g);





let mode=document.getElementById(
"modePage"
);



if(mode)

mode.innerHTML=

show(d.mode);



}









// ==========================
// SENSOR PAGE
// ==========================


function updateSensors(){


let d=latest();


if(!d)return;




let list=[


["outTempPage",d.j],

["outHumPage",d.k],

["inTempPage",d.t],

["inHumPage",d.h],

["solarPage",d.s],

["currentPage",d.a]


];



list.forEach(x=>{


let el=document.getElementById(x[0]);


if(el)

el.innerHTML=

show(x[1]);


});



}









// ==========================
// TELEMETRY
// ==========================


function updateTelemetry(){



let box=document.getElementById(
"telemetryData"
);



if(!box)

return;



box.innerHTML="";





DATA.slice(-10)

.reverse()

.forEach(d=>{



let row=document.createElement(
"div"
);



row.className=
"telemetry-row";





row.innerHTML=`

<div>${d.time.substring(11,19)}</div>

<div>${show(d.v," V")}</div>

<div>${show(d.a," mA")}</div>

<div>${show(d.s," W/m²")}</div>

<div>${show(d.j," ℃")}</div>

<div>${show(d.k," %")}</div>

<div>${show(d.t," ℃")}</div>

<div>${show(d.h," %")}</div>

`;




box.appendChild(row);



});



}









// ==========================
// CHART
// ==========================


function createTrendChart(){



let c=document.getElementById(
"trendChart"
);



if(!c)return;



if(trendChart)

trendChart.destroy();





trendChart=new Chart(c,{

type:"line",


data:{


labels:

DATA.map(d=>

d.time.substring(11,16)

),




datasets:[



{

label:"Cabin Temp",

data:

DATA.map(d=>d.t),

borderColor:"#1769AA"

},



{

label:"Voltage",

data:

DATA.map(d=>d.v),

borderColor:"#1F9D68"

},



{

label:"Solar",

data:

DATA.map(d=>d.s),

borderColor:"#F59E0B"

}



]


},




options:{


responsive:true,


maintainAspectRatio:false,


scales:{


y:{

beginAtZero:true

}


}


}



});


}








function clock(){


let el=document.getElementById(
"time"
);


if(el)

el.innerHTML=

new Date().toLocaleTimeString();



}



setInterval(clock,1000);



window.onload=loadData;
.device{

display:flex;

flex-direction:column;

align-items:center;

gap:20px;

padding:50px;

}



.module{

width:260px;

padding:30px;

text-align:center;

background:#f8fafc;

border:

2px solid #1769AA;

border-radius:12px;

font-weight:600;

color:#0B2A4A;

}



.line{

width:3px;

height:40px;

background:#94a3b8;

}
