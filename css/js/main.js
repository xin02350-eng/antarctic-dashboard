let DATA = [];
let chart = null;


// =========================
// 读取数据
// =========================

async function loadData(){

    try{

        const res = await fetch("./data.json");

        DATA = await res.json();

        updateAll();

    }catch(e){

        console.log("DATA ERROR",e);

    }

}



// =========================
// NULL显示
// =========================

function value(v,unit=""){

    if(v === null || v === undefined){

        return "NULL";

    }

    return v + unit;

}



// =========================
// 最新数据
// =========================

function latest(){

    return DATA[DATA.length-1];

}



// =========================
// GPS最近有效
// =========================

function gpsData(){

    return [...DATA]
    .reverse()
    .find(
        d =>
        d.x !== null &&
        d.y !== null
    );

}



// =========================
// 电池百分比
// =========================

function battery(v){


    if(v===null || v===undefined){

        return "NULL";

    }


    if(v>=12.7) return 100;

    if(v>=12.5) return 85;

    if(v>=12.3) return 65;

    if(v>=12.1) return 45;

    if(v>=11.9) return 25;

    return 10;


}




// =========================
// 首页
// =========================

function dashboard(){


    let d = latest();

    if(!d)return;



    let ids={

        currentTemp:
        value(d.t," ℃"),

        voltage:
        value(d.v," V"),

        current:
        value(d.a),

        solar:
        value(d.s),

        insideTemp:
        value(d.t),

        insideHum:
        value(d.h),

        outsideTemp:
        value(d.j)

    };



    for(let id in ids){

        let el=document.getElementById(id);

        if(el){

            el.innerHTML=ids[id];

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



}







// =========================
// GPS
// =========================

function updateGPS(){


    let d=gpsData();


    if(!d)return;



    let list={


        latitude:
        d.x.toFixed(6)+"°",


        longitude:
        d.y.toFixed(6)+"°",


        latitudePage:
        d.x.toFixed(6)+"°",


        longitudePage:
        d.y.toFixed(6)+"°",


        satellites:
        value(d.n),


        satellitesPage:
        value(d.n),


        gpsStatusPage:
        value(d.g),


        modePage:
        value(d.mode)


    };




    for(let id in list){

        let el=document.getElementById(id);

        if(el){

            el.innerHTML=list[id];

        }

    }



}









// =========================
// sensors页面
// =========================


function sensors(){


let d=latest();


if(!d)return;



let data={


outTempPage:value(d.j),

outHumPage:value(d.k),

inTempPage:value(d.t),

inHumPage:value(d.h),

solarPage:value(d.s),

currentPage:value(d.a)


};



for(let id in data){

let el=document.getElementById(id);

if(el){

el.innerHTML=data[id];

}


}



}








// =========================
// telemetry
// =========================


function telemetry(){


let box=document.getElementById(
"telemetryData"
);


if(!box)return;



box.innerHTML="";



DATA.slice(-10)
.reverse()
.forEach(d=>{


let row=document.createElement("div");


row.className="telemetry-row";



row.innerHTML=`

<div>${d.time.substring(11,19)}</div>

<div>${value(d.v," V")}</div>

<div>${value(d.a," mA")}</div>

<div>${value(d.s," W/m²")}</div>

<div>${value(d.j," ℃")}</div>

<div>${value(d.k," %")}</div>

<div>${value(d.t," ℃")}</div>

<div>${value(d.h," %")}</div>


`;



box.appendChild(row);



});



}








// =========================
// 图表
// =========================


function createChart(){



let canvas=document.getElementById(
"trendChart"
);


if(!canvas)return;



if(chart){

chart.destroy();

}



chart=new Chart(canvas,{

type:"line",


data:{


labels:

DATA.map(
d=>d.time.substring(11,16)
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









function updateAll(){

dashboard();

updateGPS();

sensors();

telemetry();

createChart();


}



window.onload=loadData;
