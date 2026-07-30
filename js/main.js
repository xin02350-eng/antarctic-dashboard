let DATA = [];
let charts = [];



// =============================
// LOAD JSON
// =============================

async function loadData(){

    try{


        const res = await fetch("./data.json");


        if(!res.ok){

            throw new Error(
                "data.json ERROR"
            );

        }


        DATA = await res.json();


        console.log(
            "DATA LOADED",
            DATA
        );



        updateAll();



    }catch(err){

        console.error(err);

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





function set(id,value){


    let el=document.getElementById(id);


    if(el){

        el.innerHTML=value;

    }


}







// =============================
// TIME
// =============================


function updateClock(){


    let now=new Date();


    let text=

    now.getFullYear()+"-"+
    String(now.getMonth()+1).padStart(2,"0")+"-"+
    String(now.getDate()).padStart(2,"0")+" "+
    now.toLocaleTimeString();


    set(
        "time",
        text
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




function gpsStatus(v){


    if(v==="O"){

        return "ONLINE";

    }


    if(v==="N"){

        return "NO FIX";

    }


    return show(v);


}









function updateGPS(){



    let g=latestGPS();


    if(!g){

        return;

    }



    set(
        "latitude",
        g.x.toFixed(6)+"°"
    );


    set(
        "longitude",
        g.y.toFixed(6)+"°"
    );


    set(
        "satellites",
        show(g.n)
    );



    set(
        "latitudePage",
        g.x.toFixed(6)+"°"
    );


    set(
        "longitudePage",
        g.y.toFixed(6)+"°"
    );


    set(
        "satellitesPage",
        show(g.n)
    );



    set(
        "gpsStatusPage",
        gpsStatus(g.g)
    );



    set(
        "modePage",
        show(g.mode)
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



    set(
        "currentTemp",
        show(d.t," ℃")
    );



    set(
        "voltage",
        show(d.v," V")
    );



    set(
        "current",
        show(d.a," mA")
    );



    set(
        "solar",
        show(d.s," W/m²")
    );



    set(
        "insideTemp",
        show(d.t," ℃")
    );



    set(
        "insideHum",
        show(d.h," %")
    );



    set(
        "outsideTemp",
        show(d.j," ℃")
    );



    set(
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



    set(
        "outTempPage",
        show(d.j," ℃")
    );


    set(
        "outHumPage",
        show(d.k," %")
    );



    set(
        "inTempPage",
        show(d.t," ℃")
    );


    set(
        "inHumPage",
        show(d.h," %")
    );


    set(
        "solarPage",
        show(d.s," W/m²")
    );


    set(
        "currentPage",
        show(d.a," mA")
    );



}









// =============================
// TELEMETRY
// =============================


function updateTelemetry(){



    let box=document.getElementById(
        "telemetryData"
    );


    if(!box){

        return;

    }



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









// =============================
// CHART
// =============================


function createChart(id,title,labels,data){



    let canvas=document.getElementById(id);


    if(!canvas){

        return;

    }




    let c=new Chart(
        canvas,
        {

        type:"line",


        data:{


            labels:labels,


            datasets:[

            {

            label:title,

            data:data,

            borderColor:"#4DB9E8",

            tension:.3

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



    charts.push(c);


}









function createCharts(){



    let labels=

    DATA.map(d=>

        d.time.substring(11,16)

    );



    createChart(

        "trendChart",

        "Temperature",

        labels,

        DATA.map(d=>d.t)

    );




    createChart(

        "analysisTemp",

        "Cabin Temperature",

        labels,

        DATA.map(d=>d.t)

    );



    createChart(

        "analysisSolar",

        "Solar Irradiance",

        labels,

        DATA.map(d=>d.s)

    );



    createChart(

        "analysisVoltage",

        "Voltage",

        labels,

        DATA.map(d=>d.v)

    );



}









// =============================
// UPDATE ALL
// =============================


function updateAll(){


    updateClock();


    updateDashboard();


    updateGPS();


    updateSensors();


    updateTelemetry();


    createCharts();



}





window.onload=function(){

    loadData();

};
