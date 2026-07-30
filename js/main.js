// ======================================================
// ANTARCTIC NEXUS Ω
// V6 FINAL CONTROLLER
// PART 1
// ======================================================


let DATA = [];

let charts = [];

let map = null;

let markerA01 = null;




// ==============================
// DATA LOAD
// ==============================


async function loadData(){


    try{


        const res =
        await fetch("./data.json?v="+Date.now());



        if(!res.ok){

            throw new Error(
                "data.json not found"
            );

        }



        DATA =
        await res.json();



        console.log(
            "DATA:",
            DATA.length
        );



        refresh();



    }
    catch(e){

        console.error(e);

    }


}







// ==============================
// BASIC
// ==============================


function latest(){


    return DATA.length

    ?

    DATA[DATA.length-1]

    :

    null;


}





function value(v,unit=""){


    if(v===null || v===undefined){

        return "NULL";

    }


    return v+unit;


}





function text(id,val){


    let el =
    document.getElementById(id);



    if(el){

        el.innerHTML = val;

    }


}









// ==============================
// TIME
// ==============================


function clock(){


    let d =
    new Date();



    text(

        "time",

        d.getFullYear()
        + "-"
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

        d.toLocaleTimeString()

    );

}



setInterval(
clock,
1000
);









// ==============================
// GPS DATA
// ==============================


function getGPS(){



    return DATA

    .slice()

    .reverse()

    .find(

        d=>

        d.x!==null
        &&
        d.y!==null

    );


}








function gpsText(g){



    if(!g){

        return "NULL";

    }



    if(g.g==="O"){

        return "ONLINE";

    }



    if(g.g==="N"){

        return "NO FIX";

    }



    return g.g;



}









function updateGPS(){



    let g =
    getGPS();



    if(!g){

        return;

    }






    let lat =
    g.x.toFixed(6)+"°";



    let lon =
    g.y.toFixed(6)+"°";







    // Dashboard


    text(
        "latitude",
        lat
    );


    text(
        "longitude",
        lon
    );


    text(
        "satellites",
        value(g.n)
    );





    // Location


    text(
        "latitudePage",
        lat
    );


    text(
        "longitudePage",
        lon
    );


    text(
        "satellitesPage",
        value(g.n)
    );



    text(

        "gpsStatusPage",

        gpsText(g)

    );



}









// ==============================
// MAP
// ==============================


function createMap(){



    let box =
    document.getElementById(
        "worldMap"
    );



    if(!box){

        return;

    }





    let g =
    getGPS();



    let center =

    g

    ?

    [
        g.x,
        g.y
    ]

    :

    [

        30,
        120

    ];







    map =
    L.map(
        "worldMap"
    )

    .setView(

        center,

        4

    );







    // 深色世界地图


    L.tileLayer(

    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",

    {

        attribution:
        "© OpenStreetMap © CARTO"

    }

    )

    .addTo(map);









    if(g){



        markerA01 =

        L.marker(

        [

        g.x,

        g.y

        ]

        )

        .addTo(map);



        markerA01.bindPopup(

        `

        <b>

        ANT-A01

        </b>

        <br>

        ${g.x}

        <br>

        ${g.y}

        `

        );


    }



}







function updateMap(){



    if(!map){


        createMap();


        return;


    }



    let g =
    getGPS();



    if(

    g
    &&
    markerA01

    ){



        markerA01.setLatLng(

        [

        g.x,

        g.y

        ]

        );


    }



}









// ==============================
// DASHBOARD
// ==============================


function updateDashboard(){



    let d =
    latest();



    if(!d){

        return;

    }




    text(

        "systemMode",

        value(d.mode)

    );



    text(

        "voltage",

        value(d.v," V")

    );



    text(

        "current",

        value(d.a," mA")

    );



    text(

        "solar",

        value(d.s," W/m²")

    );



    text(

        "insideTemp",

        value(d.t," ℃")

    );



    text(

        "insideHum",

        value(d.h," %")

    );



    text(

        "outsideTemp",

        value(d.j," ℃")

    );



    text(

        "outsideHum",

        value(d.k," %")

    );



}// ======================================================
// SENSORS CHART
// ======================================================


function drawChart(
id,
title,
data,
zero=false
){


let canvas =
document.getElementById(id);



if(!canvas){

return;

}





let old =
Chart.getChart(canvas);



if(old){

old.destroy();

}






let chart =

new Chart(

canvas,

{


type:"line",



data:{


labels:

DATA.map(

d=>

d.time.substring(
11,
16
)

),



datasets:[{


label:title,


data:data,


borderColor:"#62d9ff",


backgroundColor:
"rgba(98,217,255,0.12)",


borderWidth:2,


pointRadius:2,


tension:.35


}]


},





options:{



responsive:true,


maintainAspectRatio:false,



plugins:{


legend:{


labels:{


color:"#e7f8ff"


}


}


},





scales:{



x:{


ticks:{


color:"#8da8bb",


maxTicksLimit:10


}


},




y:{


beginAtZero:zero,


ticks:{


color:"#8da8bb"


}


}



}



}



}



);



}









function loadSensors(){



drawChart(

"chartInTemp",

"CABIN TEMPERATURE",

DATA.map(
d=>d.t
)

);





drawChart(

"chartInHum",

"CABIN HUMIDITY",

DATA.map(
d=>d.h
)

);







drawChart(

"chartOutTemp",

"OUTSIDE TEMPERATURE",

DATA.map(
d=>d.j
)

);







drawChart(

"chartOutHum",

"OUTSIDE HUMIDITY",

DATA.map(
d=>d.k
)

);







// 太阳辐射 0开始


drawChart(

"chartSolar",

"SOLAR IRRADIANCE",

DATA.map(
d=>d.s
),

true

);







drawChart(

"chartCurrent",

"CURRENT",

DATA.map(
d=>d.a
),

true

);







drawChart(

"chartVoltage",

"VOLTAGE",

DATA.map(
d=>d.v
)

);







// 风速没有数据


drawChart(

"chartWind",

"WIND SPEED",

DATA.map(
d=>null
),

true

);



}









// ======================================================
// TELEMETRY
// ======================================================


function updateTelemetry(){



let box =
document.getElementById(
"telemetryData"
);



if(!box){

return;

}





box.innerHTML="";






DATA

.slice(-20)

.reverse()

.forEach(

d=>{



let div =
document.createElement(
"div"
);



div.className =
"telemetry-item";





div.innerHTML=



`

<h3>

${d.time}

</h3>


<p>

VOLTAGE

${value(d.v," V")}

</p>


<p>

CURRENT

${value(d.a," mA")}

</p>



<p>

SOLAR

${value(d.s," W/m²")}

</p>


<p>

CABIN

${value(d.t," ℃")}

</p>


<p>

OUTSIDE

${value(d.j," ℃")}

</p>



`;





box.appendChild(div);



}



);



}









// ======================================================
// HARDWARE
// ======================================================


function updateHardware(){



let d =
latest();



if(!d){

return;

}





text(

"hardwareSolar",

value(
d.s,
" W/m²"
)

);





text(

"hardwareVoltage",

value(
d.v,
" V"
)

);





text(

"hardwareTemp",

value(
d.t,
" ℃"
)

);





let g =
getGPS();



if(g){


text(

"hardwareGPS",

"ONLINE"

);


}



}









// ======================================================
// ANALYSIS
// ======================================================


function updateAnalysis(){



if(DATA.length===0){

return;

}





let start =

new Date(

DATA[0].time

);



let end =

new Date(

DATA[
DATA.length-1
].time

);






let days =

Math.floor(

(end-start)

/

86400000

);





text(

"runDays",

days

);





text(

"dataCount",

DATA.length

);





text(

"lastUpdate",

latest().time

);



}









// ======================================================
// REFRESH
// ======================================================


function refresh(){



updateClock();


updateDashboard();


updateGPS();


updateMap();


updateTelemetry();


updateHardware();


updateAnalysis();





// 等DOM完成后加载图表


setTimeout(

()=>{

loadSensors();

},

500

);



}









// ======================================================
// START
// ======================================================


window.addEventListener(

"load",

()=>{


clock();


loadData();


}

);
