let DATA = [];

let charts = [];




// =============================
// LOAD DATA
// =============================

async function loadData(){


    try{


        const res = await fetch("./data.json");


        if(!res.ok){

            throw new Error("data.json error");

        }



        DATA = await res.json();



        console.log(
            "DATA LOAD:",
            DATA.length
        );



        updateAll();



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



function show(v,unit=""){


    if(v===null || v===undefined){

        return "NULL";

    }


    return v + unit;


}



function setText(id,value){


    let el=document.getElementById(id);


    if(el){

        el.innerHTML=value;

    }


}









// =============================
// CLOCK
// =============================


function updateClock(){


    let now=new Date();


    let str=

    now.getFullYear()
    +"-"+
    String(now.getMonth()+1).padStart(2,"0")
    +"-"+
    String(now.getDate()).padStart(2,"0")
    +" "
    +
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



function gpsState(v){


    if(v==="O"){

        return "ONLINE";

    }


    if(v==="N"){

        return "NO FIX";

    }


    return show(v);


}








function updateGPS(){


    let gps=latestGPS();



    if(!gps){

        return;

    }




    setText(
        "latitude",
        gps.x.toFixed(6)
        +"°"
    );



    setText(
        "longitude",
        gps.y.toFixed(6)
        +"°"
    );



    setText(
        "satellites",
        show(gps.n)
    );





    setText(
        "latitudePage",
        gps.x.toFixed(6)
        +"°"
    );



    setText(
        "longitudePage",
        gps.y.toFixed(6)
        +"°"
    );



    setText(
        "satellitesPage",
        show(gps.n)
    );



    setText(
        "gpsStatusPage",
        gpsState(gps.g)
    );



}









// =============================
// MODE
// N/S/E
// =============================


function updateMode(){


    let d=latest();


    if(!d)return;



    setText(
        "systemMode",
        show(d.mode)
    );


}









// =============================
// DASHBOARD
// =============================


function updateDashboard(){



    let d=latest();



    if(!d){

        return;

    }



    setText(
        "currentTemp",
        show(d.t," ℃")
    );



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



    setText(
        "batterySOC",
        "N/A"
    );



}









// =============================
// SENSOR PAGE
// =============================


function updateSensors(){


    let d=latest();


    if(!d)return;



    setText(
        "outTempPage",
        show(d.j," ℃")
    );



    setText(
        "outHumPage",
        show(d.k," %")
    );



    setText(
        "inTempPage",
        show(d.t," ℃")
    );



    setText(
        "inHumPage",
        show(d.h," %")
    );



    setText(
        "solarPage",
        show(d.s," W/m²")
    );



    setText(
        "currentPage",
        show(d.a," mA")
    );


}









// =============================
// TELEMETRY 20
// =============================


function updateTelemetry(){


    let box=
    document.getElementById(
        "telemetryData"
    );



    if(!box){

        return;

    }



    box.innerHTML="";





    DATA.slice(-20)

    .reverse()

    .forEach(d=>{



        let row=document.createElement(
            "div"
        );



        row.className=
        "telemetry-row";



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









// =============================
// CHART
// =============================


function createChart(
id,
name,
data,
zero=false
){



    let canvas=
    document.getElementById(id);



    if(!canvas){

        return;

    }



    let chart=new Chart(
        canvas,
        {

        type:"line",


        data:{


        labels:

        DATA.map(d=>

            d.time.substring(11,16)

        ),



        datasets:[{

            label:name,

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









function createCharts(){



    createChart(

        "analysisSolar",

        "Solar Irradiance",

        DATA.map(d=>d.s),

        true

    );



    createChart(

        "analysisCurrent",

        "Current",

        DATA.map(d=>d.a),

        true

    );



    createChart(

        "analysisVoltage",

        "Voltage",

        DATA.map(d=>d.v),

        false

    );



    createChart(

        "windChart",

        "Wind Speed",

        DATA.map(d=>null),

        true

    );


}









function updateAnalysis(){


    setText(

    "dataCount",

    DATA.length

    );



    if(DATA.length>0){


        setText(

        "lastUpdate",

        latest().time

        );


    }



}









function updateAll(){



    updateClock();


    updateDashboard();


    updateGPS();


    updateMode();


    updateSensors();


    updateTelemetry();


    updateAnalysis();


    createCharts();



}






window.onload=loadData;
