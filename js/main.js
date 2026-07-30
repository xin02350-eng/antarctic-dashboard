let DATA=[];

let chart=null;



async function loadData(){

    try{

        const res=await fetch("./data.json");

        DATA=await res.json();

        console.log(DATA);


        updateDashboard();

        updateLocation();

        updateSensors();

        updateTelemetry();

        createChart();


    }catch(e){

        console.log(e);

    }

}





function show(v,unit=""){

    if(v===null || v===undefined){

        return "NULL";

    }

    return v+unit;

}




function latest(){

    return DATA[DATA.length-1];

}





function latestGPS(){

    return [...DATA]
    .reverse()
    .find(d=>

        d.x!==null &&
        d.y!==null

    );

}






// 电池百分比

function battery(v){

    if(v===null || v===undefined){

        return "NULL";

    }


    if(v>=12.7)return 100;

    if(v>=12.5)return 95;

    if(v>=12.0)return 90;

    if(v>=11.4)return 85;

    if(v>=10.8)return 80;

    return 70;

}









function updateDashboard(){


let d=latest();

if(!d)return;



let map={


currentTemp:
show(d.t," ℃"),


voltage:
show(d.v," V"),


current:
show(d.a),


solar:
show(d.s),


insideTemp:
show(d.t),


insideHum:
show(d.h),


outsideTemp:
show(d.j)



};



for(let id in map){

let el=document.getElementById(id);

if(el){

el.innerHTML=map[id];

}

}





let soc=battery(d.v);


let socEl=document.getElementById(
"batterySOC"
);


if(socEl){

socEl.innerHTML=

soc==="NULL"
?
"NULL"
:
soc+"%";

}



let bar=document.getElementById(
"batteryProgress"
);


if(bar && soc!=="NULL"){

bar.style.width=soc+"%";

}


updateGPS();


}









function updateGPS(){


let g=latestGPS();


if(!g)return;



let data={


latitude:
g.x.toFixed(6),


longitude:
g.y.toFixed(6),


satellites:
show(g.n),


latitudePage:
g.x.toFixed(6),


longitudePage:
g.y.toFixed(6),


satellitesPage:
show(g.n),


gpsStatusPage:
show(g.g),


modePage:
show(g.mode)



};



for(let id in data){

let el=document.getElementById(id);

if(el){

el.innerHTML=data[id];

}

}


}










function updateSensors(){


let d=latest();


if(!d)return;



let data={


outTempPage:
show(d.j),


outHumPage:
show(d.k),


inTempPage:
show(d.t),


inHumPage:
show(d.h),


solarPage:
show(d.s),


currentPage:
show(d.a)



};



for(let id in data){


let el=document.getElementById(id);


if(el){

el.innerHTML=data[id];

}


}



}










function updateTelemetry(){


let box=document.getElementById(
"telemetryData"
);


if(!box)return;



box.innerHTML="";



DATA.slice(-10)
.reverse()
.forEach(d=>{


let row=document.createElement(
"div"
);


row.className="telemetry-row";


row.innerHTML=`

<div>${d.time.substring(11,19)}</div>

<div>${show(d.v,"V")}</div>

<div>${show(d.a,"mA")}</div>

<div>${show(d.s,"W/m²")}</div>

<div>${show(d.j,"℃")}</div>

<div>${show(d.k,"%")}</div>

<div>${show(d.t,"℃")}</div>

<div>${show(d.h,"%")}</div>

`;

box.appendChild(row);



});


}









function createChart(){


let c=document.getElementById(
"trendChart"
);


if(!c)return;



chart=new Chart(c,{

type:"line",


data:{


labels:

DATA.map(d=>

d.time.substring(11,16)

),


datasets:[

{

label:"Temperature",

data:DATA.map(d=>d.t)

},


{

label:"Solar",

data:DATA.map(d=>d.s)

},


{

label:"Voltage",

data:DATA.map(d=>d.v)

}


]


}



});



}








window.onload=loadData;
