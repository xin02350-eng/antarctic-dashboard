let DATA = [];

let charts = [];





// ===============================
// LOAD DATA
// ===============================

async function loadData(){


try{


let res =
await fetch("./data.json");


DATA =
await res.json();



console.log(
"DATA:",
DATA.length
);



updateAll();



}catch(e){

console.error(e);

}


}









function latest(){


return DATA.length
?
DATA[DATA.length-1]
:
null;


}




function show(v,u=""){


if(v===null || v===undefined){

return "NULL";

}


return v+u;


}





function setText(id,value){


let el=document.getElementById(id);


if(el){

el.innerHTML=value;

}


}









// ===============================
// CLOCK
// ===============================


function clock(){


let d=new Date();


setText(

"time",

d.getFullYear()
+"-"+
String(d.getMonth()+1).padStart(2,"0")
+"-"+
String(d.getDate()).padStart(2,"0")
+" "+
d.toLocaleTimeString()

);


}



setInterval(clock,1000);









// ===============================
// GPS
// ===============================


function latestGPS(){


return [...DATA]

.reverse()

.find(d=>

d.x!==null &&
d.y!==null

);


}





function updateGPS(){



let g=latestGPS();



if(!g)return;



setText(
"latitude",
g.x.toFixed(6)+"°"
);



setText(
"longitude",
g.y.toFixed(6)+"°"
);



setText(
"satellites",
show(g.n)
);



setText(
"latitudePage",
g.x.toFixed(6)+"°"
);



setText(
"longitudePage",
g.y.toFixed(6)+"°"
);



setText(
"satellitesPage",
show(g.n)
);



setText(
"gpsStatusPage",

g.g==="O"
?
"ONLINE"
:
g.g==="N"
?
"NO FIX"
:
show(g.g)

);


}









// ===============================
// DASHBOARD
// ===============================


function updateDashboard(){


let d=latest();


if(!d)return;




setText(
"voltage",
show(d.v," V")
);



setText(
"current",
show(d.a," mA")
);



setText(
"solar",
show(d.s," W/m²")
);



setText(
"currentTemp",
show(d.t," ℃")
);



// RS485 仓内

setText(
"insideTemp",
show(d.t," ℃")
);



setText(
"insideHum",
show(d.h," %")
);



// SHT35 仓外

setText(
"outsideTemp",
show(d.j," ℃")
);



setText(
"outsideHum",
show(d.k," %")
);




// N/S/E状态

setText(
"systemMode",
show(d.mode)
);


}









// ===============================
// SENSORS
// ===============================


function createLine(id,title,data,zero=false){



let c=document.getElementById(id);



if(!c)return;



let chart=new Chart(

c,

{

type:"line",


data:{


labels:

DATA.map(d=>

d.time.substring(11,16)

),



datasets:[{


label:title,


data:data,


borderColor:"#4DB9E8",


tension:.3


}]


},



options:{


responsive:true,


maintainAspectRatio:false,


scales:{


y:{


beginAtZero:zero


}


}



}



}

);



charts.push(chart);



}








function createSensorCharts(){



if(charts.length>0)return;



createLine(
"chartInTemp",
"Cabin Temperature",
DATA.map(d=>d.t)
);



createLine(
"chartInHum",
"Cabin Humidity",
DATA.map(d=>d.h)
);



createLine(
"chartOutTemp",
"Outside Temperature",
DATA.map(d=>d.j)
);



createLine(
"chartOutHum",
"Outside Humidity",
DATA.map(d=>d.k)
);



createLine(
"chartSolar",
"Solar Irradiance",
DATA.map(d=>d.s),
true
);



createLine(
"chartCurrent",
"Current",
DATA.map(d=>d.a),
true
);



createLine(
"chartVoltage",
"Voltage",
DATA.map(d=>d.v)
);



createLine(
"chartWind",
"Wind Speed",
DATA.map(d=>null),
true
);



}









// ===============================
// TELEMETRY
// ===============================


function updateTelemetry(){


let box=document.getElementById(
"telemetryData"
);



if(!box)return;



box.innerHTML="";



DATA.slice(-20)

.reverse()

.forEach(d=>{


let row=document.createElement("div");


row.className="telemetry-row";



row.innerHTML=`

<div>
${d.time.substring(5,16)}
</div>

<div>
${show(d.v," V")}
</div>

<div>
${show(d.a," mA")}
</div>

<div>
${show(d.s," W/m²")}
</div>

<div>
${show(d.j," ℃")}
</div>

<div>
${show(d.k," %")}
</div>

<div>
${show(d.t," ℃")}
</div>

<div>
${show(d.h," %")}
</div>

`;



box.appendChild(row);



});


}









// ===============================
// HARDWARE
// ===============================


function updateHardware(){


let d=latest();


if(!d)return;



setText(
"hardwareSolar",
show(d.s," W/m²")
);



setText(
"hardwareVoltage",
show(d.v," V")
);



setText(
"hardwareTemp",
show(d.t," ℃")
);



let gps=latestGPS();



if(gps){


setText(
"hardwareGPS",
"ONLINE"
);


}



}









// ===============================
// ANALYSIS
// ===============================


function updateAnalysis(){



setText(

"dataCount",

DATA.length

);



if(DATA.length){



setText(

"lastUpdate",

latest().time

);



let start=

new Date(
DATA[0].time
);



let end=

new Date(
latest().time
);



let days=

Math.floor(

(end-start)
/
86400000

);



setText(

"runDays",

days

);



}


}









// ===============================
// ALL
// ===============================


function updateAll(){


clock();


updateDashboard();


updateGPS();


updateTelemetry();


updateHardware();


updateAnalysis();


setTimeout(

createSensorCharts,

500

);


}






window.onload=loadData;
