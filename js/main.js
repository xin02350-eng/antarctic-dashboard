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
 V1.1 轻量国际化字典（不引入框架）
========================== */
window.ANX_I18N = {
en:{
null:"NULL",
online:"ONLINE",
no_fix:"NO FIX",
no_signal:"Waiting for Data",
waiting_data:"Waiting for Data",
no_telemetry:"Waiting for Data",
mode_unknown:"MODE UNKNOWN",
normal:"NORMAL",
standby:"Standby",
emergency:"EMERGENCY",
nominal:"NOMINAL",
awaiting_sensor:"AWAITING SENSOR",
sensor_offline:"SENSOR OFFLINE",
normal_operation:"NORMAL OPERATION",
low_power_standby:"Standby",
protective_mode:"PROTECTIVE MODE",
running:"RUNNING",
mission_status:"MISSION STATUS",
all_systems_check:"ALL SYSTEMS CHECK",
battery_bus:"BATTERY BUS",
load_draw:"LOAD DRAW",
pyranometer:"Solar Radiation Sensor",
satellites:"SATELLITES",
power:"POWER",
solar_battery:"SOLAR + BATTERY",
comms:"COMMS",
data_link:"LoRa",
fix:"FIX",
operation_days:"OPERATION DAYS",
data_records:"DATA RECORDS",
last_update:"LAST UPDATE",
stream_env:"ENVIRONMENT DATA ACQUISITION ACTIVE",
stream_gps:"SATELLITE POSITIONING ACTIVE",
stream_long:"LONG TERM MONITORING MODE",
time:"TIME",
mode:"MODE",
current_time:"CURRENT TIME",
local_time:"LOCAL TIME",
operation_mode:"OPERATION MODE",
autonomous:"AUTONOMOUS",
voltage:"VOLTAGE",
current:"CURRENT",
solar_irradiance:"SOLAR IRRADIANCE",
inside_temp:"INSIDE TEMP",
inside_humidity:"INSIDE HUMIDITY",
outside_temp:"OUTSIDE TEMP",
outside_humidity:"OUTSIDE HUMIDITY",
latitude:"LATITUDE",
longitude:"LONGITUDE",
gps_status:"GPS STATUS",
loading_history:"LOADING HISTORY…",
all_loaded:"ALL HISTORY LOADED · {n} RECORDS",
history_progress:"HISTORY {a} / {b}",
latest_records:"LATEST {n} RECORDS · {c} Data Types",
cabin_temperature:"CABIN TEMPERATURE",
cabin_humidity:"CABIN HUMIDITY",
outside_temperature:"OUTSIDE TEMPERATURE",
outside_humidity:"OUTSIDE HUMIDITY",
solar_radiation:"SOLAR IRRADIANCE",
wind_speed:"WIND SPEED",
no_data:"NO DATA",
no_data_available:"NO DATA AVAILABLE",
real_time:"REAL TIME",
current_ma:"CURRENT (mA)",
voltage_title:"VOLTAGE",
power_environment:"POWER & ENVIRONMENT",
climate_comms:"CLIMATE & COMMS",
antarctic_positioning:"ANTARCTIC POSITIONING · GPS TRACKING",
live_telemetry_feed:"Real-time Telemetry",
tracking:"TRACKING",
temperature:"TEMPERATURE",
cabin:"CABIN",
outside:"OUTSIDE",
continuous_run:"CONTINUOUS RUN",
telemetry_samples:"TELEMETRY SAMPLES",
last_data_contact:"LAST DATA CONTACT",
mission_stream:"MISSION STREAM",
solar_radiation_label:"SOLAR RADIATION",
lat:"LAT",
lon:"LON",
brand_subtitle:"POLAR AUTONOMOUS OBSERVATORY",
real_world_map:"REAL WORLD MAP",
ant_a01_position:"ANT-A01 POSITION",
deployment_nodes:"DEPLOYMENT NODES",
position_fix:"POSITION FIX",
identification:"IDENTIFICATION",
specifications:"SPECIFICATIONS",
designation:"DESIGNATION",
type:"TYPE",
polar_node:"POLAR NODE",
version:"VERSION",
status:"STATUS",
active:"ACTIVE",
enclosure:"ENCLOSURE",
power_value:"Solar + Lithium Titanate Battery",
device_photograph:"DEVICE PHOTOGRAPH · FIELD DEPLOYMENT",
file_label:"FILE: ANT-A01_001 · REV V0.4",
real_device_photo:"REAL DEVICE PHOTO",
image_slot:"IMAGE SLOT · REPLACE WITH FIELD PHOTOGRAPH",
captured_pending:"CAPTURED: PENDING",
location_field:"LOCATION: ANTARCTIC FIELD SITE",
doc_archive:"DOC: HARDWARE ARCHIVE",
live_telemetry:"LIVE TELEMETRY",
power_solar:"POWER · SOLAR",
battery:"BATTERY",
sensor_cabin:"SENSOR · CABIN",
deployment:"DEPLOYMENT",
site:"SITE",
antarctica:"ANTARCTICA",
mount:"MOUNT",
ice_anchor:"ICE ANCHOR",
lora_uplink:"LoRa UPLINK",
solar:"SOLAR",
volt:"VOLT",
temp:"TEMP",
sensor:"Sensors",
gps_lora:"GPS / LORA"
,
gps:"GPS",
link:"LINK"
},
zh:{
null:"无数据",
online:"在线",
no_fix:"未定位",
no_signal:"等待数据",
waiting_data:"等待数据",
no_telemetry:"等待数据",
mode_unknown:"模式未知",
normal:"正常",
standby:"节能",
emergency:"应急",
nominal:"正常",
awaiting_sensor:"等待传感器",
sensor_offline:"传感器离线",
normal_operation:"正常运行",
low_power_standby:"节能",
protective_mode:"保护模式",
running:"运行中",
mission_status:"任务状态",
all_systems_check:"全系统自检",
battery_bus:"电池母线",
load_draw:"负载电流",
pyranometer:"太阳能辐射传感器",
satellites:"卫星数",
power:"供电",
solar_battery:"太阳能 + 电池",
comms:"通信",
data_link:"LoRa",
fix:"定位",
operation_days:"运行天数",
data_records:"数据记录",
last_update:"最近更新",
stream_env:"环境数据采集运行中",
stream_gps:"卫星定位运行中",
stream_long:"长期监测模式",
time:"时间",
mode:"模式",
current_time:"当前时间",
local_time:"本地时间",
operation_mode:"运行模式",
autonomous:"自动",
voltage:"电压",
current:"电流",
solar_irradiance:"太阳辐射",
inside_temp:"舱内温度",
inside_humidity:"舱内湿度",
outside_temp:"舱外温度",
outside_humidity:"舱外湿度",
latitude:"纬度",
longitude:"经度",
gps_status:"GPS 状态",
loading_history:"正在加载历史…",
all_loaded:"全部历史已加载 · {n} 条",
history_progress:"已加载 {a} / {b}",
latest_records:"最新 {n} 条记录 · {c} 类采集数据",
cabin_temperature:"舱内温度",
cabin_humidity:"舱内湿度",
outside_temperature:"舱外温度",
outside_humidity:"舱外湿度",
solar_radiation:"太阳辐射",
wind_speed:"风速",
no_data:"无数据",
no_data_available:"暂无数据",
real_time:"实时",
current_ma:"电流 (mA)",
voltage_title:"电压",
power_environment:"供电与环境",
climate_comms:"气候与通信",
antarctic_positioning:"南极定位 · GPS 跟踪",
live_telemetry_feed:"实时遥测",
tracking:"跟踪中",
temperature:"温度",
cabin:"舱内",
outside:"舱外",
continuous_run:"持续运行",
telemetry_samples:"遥测样本",
last_data_contact:"最近数据联系",
mission_stream:"任务流",
solar_radiation_label:"太阳辐射",
lat:"纬度",
lon:"经度",
brand_subtitle:"极地自主观测站",
real_world_map:"实景地图",
ant_a01_position:"ANT-A01 位置",
deployment_nodes:"部署节点",
position_fix:"定位有效",
identification:"识别信息",
specifications:"规格参数",
designation:"编号",
type:"类型",
polar_node:"极地节点",
version:"版本",
status:"状态",
active:"运行中",
enclosure:"防护等级",
power_value:"太阳能 + 钛酸锂电池",
device_photograph:"设备实拍 · 野外部署",
file_label:"文件：ANT-A01_001 · 版本 V0.4",
real_device_photo:"真实设备照片",
image_slot:"图片位 · 替换为实地照片",
captured_pending:"拍摄状态：待补充",
location_field:"地点：南极野外站点",
doc_archive:"档案：硬件档案",
live_telemetry:"实时遥测",
power_solar:"供电 · 太阳能",
battery:"电池",
sensor_cabin:"传感器 · 舱内",
deployment:"部署信息",
site:"站点",
antarctica:"南极",
mount:"安装方式",
ice_anchor:"冰锚固定",
lora_uplink:"LoRa 上行链路",
solar:"太阳能",
volt:"电压",
temp:"温度",
sensor:"传感器",
gps_lora:"GPS / LoRa"
,
gps:"GPS",
link:"通信链路"
}
};

window.ANX_LANG = "en";
window.ANX_T = function (key, params) {
  var dict = (window.ANX_I18N && window.ANX_I18N[window.ANX_LANG]) || (window.ANX_I18N && window.ANX_I18N.en) || {};
  var text = dict[key] !== undefined ? dict[key] : key;
  if (params) {
    Object.keys(params).forEach(function (k) {
      text = String(text).split("{" + k + "}").join(params[k]);
    });
  }
  return text;
};
window.ANX_APPLY_I18N = function (lang) {
  window.ANX_LANG = lang === "zh" ? "zh" : "en";
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var key = el.getAttribute("data-i18n");
    if (key) el.textContent = window.ANX_T(key);
  });
};
window.ANX_PARSE_TIME = function (t) {
  if (!t) return null;
  if (t instanceof Date) return isNaN(t.getTime()) ? null : t;
  if (typeof t === "number") return new Date(t);
  var d = new Date(t);
  if (!isNaN(d.getTime())) return d;
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(t));
  if (m) {
    var dt = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
};





/* ==========================
 数据读取
========================== */


async function loadData(){


var delays = [1000, 2000, 4000];
for (var attempt = 0; attempt <= delays.length; attempt++) {
try{
let url = "./data.json?v=" + Date.now() + "&try=" + attempt;



let res = await fetch(url);



if(!res.ok){

throw new Error(
"data.json HTTP "
+
res.status
);

}



DATA = await res.json();
if(!Array.isArray(DATA)){
throw new Error("data.json format invalid");
}



console.log(
"DATA:",
DATA.length
);




processData();



fullRefresh();
return;



}
catch(err){


console.error(
"DATA LOAD ERROR (attempt " + (attempt + 1) + "):",
err
);
if (attempt < delays.length) {
await new Promise(function (resolve) { setTimeout(resolve, delays[attempt]); });
}



}
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


return window.ANX_T ? window.ANX_T("null") : "NULL";


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

return window.ANX_T ? window.ANX_T("null") : "NULL";


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
window.ANX_T ? window.ANX_T("online") : "ONLINE"
:
window.ANX_T ? window.ANX_T("null") : "NULL";

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


gps.innerHTML=window.ANX_T ? window.ANX_T("online") : "ONLINE";


}

else{


gps.innerHTML=window.ANX_T ? window.ANX_T("null") : "NULL";


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
window.ANX_PARSE_TIME ? window.ANX_PARSE_TIME(time) : new Date(time);
if(!d || isNaN(d.getTime())){
return "";
}



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



if(document.body && document.body.classList && document.body.classList.contains("telemetry-page")){
return;
}


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

${window.ANX_T ? window.ANX_T("voltage") : "VOLTAGE"}:

${showValue(d.v)}

</p>



<p>

${window.ANX_T ? window.ANX_T("inside_temp") : "TEMP"}:

${showValue(d.t)}

</p>



<p>

${window.ANX_T ? window.ANX_T("inside_humidity") : "HUMIDITY"}:

${showValue(d.h)}

</p>



<p>

${window.ANX_T ? window.ANX_T("current") : "CURRENT"}:

${showValue(d.a)}

</p>



<p>

${window.ANX_T ? window.ANX_T("mode") : "MODE"}:

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

return window.ANX_T ? window.ANX_T("null") : "NULL";

}



let d=

window.ANX_PARSE_TIME ? window.ANX_PARSE_TIME(t) : new Date(t);
if(!d || isNaN(d.getTime())){
return "NULL";
}




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

var anyTarget = ["missionDays","runDays","totalRecords","dataCount","lastContact","lastUpdate","gpsValidCount"].some(function(id){
return !!document.getElementById(id);
});
if(!anyTarget){
return;
}





let start =

window.ANX_PARSE_TIME ? window.ANX_PARSE_TIME(

DATA[0].time

) : new Date(DATA[0].time);



let end =

window.ANX_PARSE_TIME ? window.ANX_PARSE_TIME(

DATA[DATA.length-1].time

) : new Date(DATA[DATA.length-1].time);





let days =

(start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) ? Math.max(1, Math.ceil(

(end-start)

/

86400000
) ) : "--";







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
