/* =====================================================
 ANTARCTIC NEXUS Ω
 MAIN.JS V7 FINAL

 PART 1 / 4

 DATA CORE
===================================================== */



let DATA = [];

let latest = null;

let gpsData = {

lat:null,

lng:null,

sat:null,

status:null

};


let charts = {};





/* ==========================
 数据读取
========================== */


async function loadData(){


try{


let url = "./data.json?v=" + Date.now();



let res = await fetch(url);



if(!res.ok){

throw new Error(
"data.json HTTP "
+
res.status
);

}



DATA = await res.json();



console.log(
"DATA:",
DATA.length
);




processData();



fullRefresh();



}
catch(err){


console.error(
"DATA LOAD ERROR:",
err
);



}

}









/* ==========================
 数据处理
========================== */


function processData(){



if(!DATA.length){

return;

}




latest =
DATA[
DATA.length-1
];




/*
 GPS:
 使用最近有效数据

 x = latitude
 y = longitude

 NULL保持NULL

*/


for(
let i=DATA.length-1;
i>=0;
i--
){


let d=DATA[i];



if(

d.x!==null
&&
d.x!==undefined
&&
d.y!==null
&&
d.y!==undefined

){


gpsData.lat=d.x;

gpsData.lng=d.y;

gpsData.sat=d.n;

gpsData.status=d.g;


break;


}


}




}









/* ==========================
 安全显示
========================== */


function showValue(v){


if(
v===null
||
v===undefined
||
v===""

){


return "NULL";


}


return v;


}









/* ==========================
 时间系统
 修复 updateClock
========================== */



function updateClock(){


let el =
document.getElementById(
"localTime"
)
||
document.getElementById(
"time"
);



let now =
new Date();




let text =

now.getFullYear()
+
"-"
+
String(
now.getMonth()+1
).padStart(2,"0")
+
"-"
+
String(
now.getDate()
).padStart(2,"0")
+
" "
+
now.toLocaleTimeString();





if(el){


el.innerHTML=text;


}




let utc =

document.getElementById(
"utcTime"
);



if(utc){


utc.innerHTML=
now.toISOString()
.replace("T"," ")
.substring(0,19)
+
" UTC";


}



}









/* ==========================
 时间启动
========================== */



setInterval(

updateClock,

1000

);









/* ==========================
 当前数据
========================== */



function getLatest(){


if(!latest){

return {

};


}



return latest;


}









/* ==========================
 状态方向
 N/S/E
========================== */


function getMode(){


if(!latest){

return "NULL";


}


return showValue(
latest.mode
||
latest.g
||
"N"
);


}/* =====================================================
 PART 2 / 4

 DASHBOARD
 GPS
 HARDWARE
 MAP

===================================================== */







/* ==========================
 Dashboard刷新
========================== */


function updateDashboard(){



let d=getLatest();



if(!d){

return;

}





/*
 电压
*/


let voltage =

document.getElementById(
"voltage"
);



if(voltage){

voltage.innerHTML=
showValue(d.v);


}






/*
 电流
*/


let current =

document.getElementById(
"current"
);



if(current){

current.innerHTML=
showValue(d.a);


}







/*
 温度
*/


let temp =

document.getElementById(
"temperature"
)
||
document.getElementById(
"insideTemp"
);



if(temp){

temp.innerHTML=
showValue(d.t);


}








/*
 湿度
*/


let humidity =

document.getElementById(
"humidity"
);



if(humidity){

humidity.innerHTML=
showValue(d.h);


}


let outsideTemp =

document.getElementById(
"outsideTemp"
);


if(outsideTemp){

outsideTemp.innerHTML=
showValue(d.j);

}


let outsideHumidity =

document.getElementById(
"outsideHumidity"
);


if(outsideHumidity){

outsideHumidity.innerHTML=
showValue(d.k);

}


let solar =

document.getElementById(
"solar"
);


if(solar){

solar.innerHTML=
showValue(d.s);

}


let gpsStatus =

document.getElementById(
"gpsStatusPage"
);


if(gpsStatus){

gpsStatus.innerHTML=
gpsData.lat!==null && gpsData.lng!==null
?
"ONLINE"
:
"NULL";

}


let satelliteSmall =

document.getElementById(
"satelliteSmall"
);


if(satelliteSmall){

satelliteSmall.innerHTML=
showValue(gpsData.sat);

}








/*
 模式 N/S/E

*/


let mode =

document.getElementById(
"mode"
)
||
document.getElementById(
"systemMode"
);



if(mode){


mode.innerHTML=
showValue(getMode());


}








}












/* ==========================
 Hardware
========================== */



function updateHardware(){



let d=getLatest();



if(!d){

return;

}






let solar=

document.getElementById(
"hardwareSolar"
);



if(solar){


solar.innerHTML=
showValue(d.s);


}








let voltage=

document.getElementById(
"hardwareVoltage"
);



if(voltage){


voltage.innerHTML=
showValue(d.v);


}








let temp=

document.getElementById(
"hardwareTemp"
);



if(temp){


temp.innerHTML=
showValue(d.t);


}







let gps=

document.getElementById(
"hardwareGPS"
);



if(gps){



if(
gpsData.lat!==null
&&
gpsData.lng!==null

){


gps.innerHTML="ONLINE";


}

else{


gps.innerHTML="NULL";


}



}





}









/* ==========================
 GPS显示
========================== */



function updateGPS(){



let lat=

document.getElementById(
"latitude"
)
||
document.getElementById(
"latitudePage"
);



let lng=

document.getElementById(
"longitude"
)
||
document.getElementById(
"longitudePage"
);



let sat=

document.getElementById(
"satellites"
)
||
document.getElementById(
"satellitesPage"
);





if(lat){


lat.innerHTML=

showValue(
gpsData.lat
);



}




if(lng){


lng.innerHTML=

showValue(
gpsData.lng
);



}




if(sat){


sat.innerHTML=

showValue(
gpsData.sat

);



}





}









/* ==========================
 地图
========================== */



function updateMap(){



let mapBox=

document.getElementById(
"worldMap"
);



if(!mapBox){

return;

}





if(
typeof L==="undefined"

){


console.warn(
"Leaflet not loaded"
);


return;


}






if(
!gpsData.lat
||
!gpsData.lng

){

return;


}







if(window.deviceMap){


window.deviceMap.setView(

[
gpsData.lat,
gpsData.lng
],

8

);



if(window.deviceMarker){


window.deviceMarker.setLatLng(

[
gpsData.lat,
gpsData.lng
]

);


}



return;


}








window.deviceMap =

L.map(
"worldMap",

{

zoomControl:false

}

)
.setView(

[
gpsData.lat,
gpsData.lng
],

5

);








L.tileLayer(

"https://tile.openstreetmap.org/{z}/{x}/{y}.png",

{

maxZoom:18

}

)
.addTo(

window.deviceMap

);






window.deviceMarker =

L.marker(

[
gpsData.lat,
gpsData.lng
]

)
.addTo(

window.deviceMap

)
.bindPopup(

"ANT-A01"

);







}









/* ==========================
 主刷新
========================== */



function refresh(){



updateClock();


updateDashboard();


updateHardware();


updateGPS();


updateMap();


}
/* =====================================================
 PART 3 / 4

 SENSOR CHART SYSTEM

===================================================== */







let sensorConfig = [

{
id:"chartInTemp",
key:"t",
name:"INSIDE TEMPERATURE"
},


{
id:"chartInHum",
key:"h",
name:"INSIDE HUMIDITY"
},


{
id:"chartOutTemp",
key:"j",
name:"OUTSIDE TEMPERATURE"
},


{
id:"chartOutHum",
key:"k",
name:"OUTSIDE HUMIDITY"
},


{
id:"chartSolar",
key:"s",
name:"SOLAR RADIATION"
},


{
id:"chartCurrent",
key:"a",
name:"CURRENT"
},


{
id:"chartVoltage",
key:"v",
name:"VOLTAGE"
},


{
id:"chartWind",
key:"wind",
name:"WIND SPEED"
}

];









/* ==========================
 时间格式
 到小时
========================== */


function formatHour(time){


if(!time){

return "";

}


let d =
new Date(time);



return (

String(
d.getMonth()+1
)
.padStart(2,"0")

)

+

"/"

+

String(
d.getDate()
)
.padStart(2,"0")

+

" "

+

String(

d.getHours()

)

.padStart(2,"0")

+

":00";


}









/* ==========================
 生成图表
========================== */



function createSensorCharts(){



if(
typeof Chart==="undefined"

){


console.warn(

"Chart.js not loaded"

);


return;

}






sensorConfig.forEach(

item=>{





let canvas=

document.getElementById(
item.id
);





if(!canvas){

return;

}





let labels=[];

let values=[];






DATA.forEach(

d=>{



labels.push(

formatHour(
d.time
)

);



let value=

d[item.key];






if(
value===null
||
value===undefined

){


values.push(null);


}

else{


values.push(value);


}



});









if(charts[item.id]){


charts[item.id].destroy();


}






charts[item.id]=

new Chart(

canvas,

{


type:"line",



data:{


labels:labels,



datasets:[


{


label:item.name,


data:values,



borderWidth:2,



tension:.35,



pointRadius:2,



fill:false



}


]



},




options:{


responsive:true,



maintainAspectRatio:false,



plugins:{


legend:{


display:false


}


},




scales:{



x:{


ticks:{


maxTicksLimit:8


}



},



y:{


beginAtZero:false


}



}



}





}

);







});






}









/* ==========================
 Sensors刷新
========================== */


function updateSensors(){


createSensorCharts();



}
/* =====================================================
 PART 4 / 4

 TELEMETRY
 ANALYSIS
 INIT

===================================================== */






/* ==========================
 Telemetry
 20条数据
========================== */


function updateTelemetry(){



let box =

document.getElementById(

"telemetryList"

)
||
document.getElementById(

"telemetryData"

);





if(!box){

return;

}





box.innerHTML="";





let list =

DATA.slice(

Math.max(

0,

DATA.length-20

)

)

.reverse();







list.forEach(

d=>{





let item =

document.createElement(

"div"

);



item.className=

"telemetry-item";







item.innerHTML=



`

<h3>

${formatTelemetryTime(d.time)}

</h3>



<p>

VOLTAGE:

${showValue(d.v)}

</p>



<p>

TEMP:

${showValue(d.t)}

</p>



<p>

HUMIDITY:

${showValue(d.h)}

</p>



<p>

CURRENT:

${showValue(d.a)}

</p>



<p>

MODE:

${showValue(d.mode)}

</p>



`;






box.appendChild(item);



});







}









/* ==========================
 Telemetry 时间
========================== */


function formatTelemetryTime(t){


if(!t){

return "NULL";

}



let d=

new Date(t);




return (

d.getFullYear()

+

"-"

+

String(
d.getMonth()+1
).padStart(2,"0")

+

"-"

+

String(
d.getDate()
).padStart(2,"0")

+

" "

+
String(
d.getHours()
).padStart(2,"0")
+
":"
+
String(
d.getMinutes()
).padStart(2,"0")
+
":"
+
String(
d.getSeconds()
).padStart(2,"0")

);


}









/* ==========================
 Analysis
========================== */



function updateAnalysis(){



if(!DATA.length){

return;

}





let start =

new Date(

DATA[0].time

);



let end =

new Date(

DATA[DATA.length-1].time

);





let days =

Math.ceil(

(end-start)

/

86400000

);







let daysEl =

document.getElementById(

"missionDays"

)
||
document.getElementById(

"runDays"

);





if(daysEl){


daysEl.innerHTML=

days;


}







let total =

document.getElementById(

"totalRecords"

)
||
document.getElementById(

"dataCount"

);





if(total){


total.innerHTML=

DATA.length;


}





let last =

document.getElementById(

"lastContact"

)
||
document.getElementById(

"lastUpdate"

);





if(last){


last.innerHTML=

formatTelemetryTime(

latest.time

);


}


let gpsValid =

document.getElementById(

"gpsValidCount"

);


if(gpsValid){

gpsValid.innerHTML=
DATA.filter(
d=>
d.x!==null
&&
d.x!==undefined
&&
d.y!==null
&&
d.y!==undefined
).length;

}



}









/* ==========================
 所有页面刷新
========================== */


function fullRefresh(){



refresh();



updateTelemetry();



updateAnalysis();



updateSensors();



}









/* ==========================
 初始化
========================== */


document.addEventListener(

"DOMContentLoaded",

()=>{





loadData();





});
