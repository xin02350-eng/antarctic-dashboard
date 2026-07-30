let DATA = [];

let chart = null;



// ===============================
// LOAD DATA
// ===============================

async function loadData(){


    try{


        const response = await fetch("./data.json");


        if(!response.ok){

            throw new Error(
                "data.json load failed"
            );

        }



        DATA = await response.json();


        console.log(
            "DATA:",
            DATA
        );


        updateDashboard();

        updateLocation();

        updateSensors();

        updateTelemetry();

        createChart();



    }catch(error){


        console.error(error);


    }



}







// ===============================
// FORMAT
// ===============================


function show(value,unit=""){


    if(
        value === null ||
        value === undefined
    ){

        return "NULL";

    }


    return value + unit;


}









// ===============================
// LAST DATA
// ===============================


function latest(){


    if(DATA.length===0){

        return null;

    }


    return DATA[
        DATA.length-1
    ];


}









// ===============================
// GPS ONLY
// 最近有效
// ===============================


function latestGPS(){


    return [...DATA]

    .reverse()

    .find(item =>

        item.x !== null &&

        item.y !== null

    );


}









// ===============================
// BATTERY
// 不计算SOC
// ===============================


function batterySOC(){


    return "N/A";


}









// ===============================
// DASHBOARD
// ===============================


function updateDashboard(){



    let d = latest();


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



    setText(
        "insideTemp",
        show(d.t," ℃")
    );



    setText(
        "insideHum",
        show(d.h," %")
    );



    setText(
        "outsideTemp",
        show(d.j," ℃")
    );



    setText(
        "batterySOC",
        batterySOC()
    );




    updateGPS();


}









// ===============================
// GPS UPDATE
// ===============================


function updateGPS(){


    let gps =
    latestGPS();



    if(!gps){

        return;

    }



    setText(
        "latitude",
        gps.x.toFixed(6)
    );


    setText(
        "longitude",
        gps.y.toFixed(6)
    );


    setText(
        "satellites",
        show(gps.n)
    );





    setText(
        "latitudePage",
        gps.x.toFixed(6)
    );


    setText(
        "longitudePage",
        gps.y.toFixed(6)
    );


    setText(
        "satellitesPage",
        show(gps.n)
    );



    setText(
        "gpsStatusPage",
        show(gps.g)
    );



    setText(
        "modePage",
        show(gps.mode)
    );



}









// ===============================
// SENSOR PAGE
// ===============================


function updateSensors(){


    let d=latest();


    if(!d){

        return;

    }



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









// ===============================
// TELEMETRY
// ===============================


function updateTelemetry(){


    let box =
    document.getElementById(
        "telemetryData"
    );



    if(!box){

        return;

    }



    box.innerHTML="";





    DATA.slice(-10)

    .reverse()

    .forEach(item=>{


        let row =
        document.createElement(
            "div"
        );



        row.className =
        "telemetry-row";



        row.innerHTML = `


        <div>
        ${item.time.substring(11,19)}
        </div>


        <div>
        ${show(item.v," V")}
        </div>


        <div>
        ${show(item.a," mA")}
        </div>


        <div>
        ${show(item.s," W/m²")}
        </div>


        <div>
        ${show(item.j," ℃")}
        </div>


        <div>
        ${show(item.k," %")}
        </div>


        <div>
        ${show(item.t," ℃")}
        </div>


        <div>
        ${show(item.h," %")}
        </div>


        `;



        box.appendChild(row);



    });



}









// ===============================
// CHART
// ===============================


function createChart(){



    let canvas =
    document.getElementById(
        "trendChart"
    );



    if(!canvas){

        return;

    }




    if(chart){

        chart.destroy();

    }






    chart = new Chart(

        canvas,


        {


        type:"line",


        data:{



        labels:

        DATA.map(item=>

            item.time.substring(11,16)

        ),




        datasets:[



        {


        label:"Cabin Temperature",


        data:

        DATA.map(item=>

            item.t

        ),



        borderColor:"#4DB9E8",


        tension:.3



        },





        {


        label:"Solar",


        data:

        DATA.map(item=>

            item.s

        ),


        borderColor:"#4FD18B",


        tension:.3


        },





        {


        label:"Voltage",


        data:

        DATA.map(item=>

            item.v

        ),


        borderColor:"#FFB84D",


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




        }

    );



}









// ===============================
// SET TEXT
// ===============================


function setText(id,value){



    let el =
    document.getElementById(id);



    if(el){


        el.innerHTML=value;


    }


}









// ===============================
// START
// ===============================


window.onload=function(){


    loadData();


};
