// =====================================================
// ANTARCTIC NEXUS Ω
// FINAL V5 MAIN CONTROLLER
// PART 1 / 2
// =====================================================


let DATA = [];

let map = null;

let markerA01 = null;

let charts = [];




// =====================================================
// LOAD DATA
// =====================================================


async function loadData(){


    try{


        const response =
        await fetch("./data.json");



        if(!response.ok){

            throw new Error(
                "data.json loading failed"
            );

        }



        DATA =
        await response.json();



        console.log(
            "DATA READY:",
            DATA.length
        );



        updateAll();



    }
    catch(error){


        console.error(error);


    }



}









// =====================================================
// BASIC FUNCTION
// =====================================================


function latest(){


    if(DATA.length===0){

        return null;

    }


    return DATA[
        DATA.length-1
    ];


}





function show(value,unit=""){


    if(
        value===null ||
        value===undefined
    ){

        return "NULL";

    }


    return value + unit;


}





function setText(id,value){


    let element =
    document.getElementById(id);



    if(element){


        element.innerHTML =
        value;


    }


}









// =====================================================
// TIME
// =====================================================


function updateClock(){



    let now =
    new Date();



    let text =

    now.getFullYear()
    + "-"
    +
    String(
        now.getMonth()+1
    ).padStart(2,"0")

    + "-"

    +
    String(
        now.getDate()
    ).padStart(2,"0")

    + " "

    +
    now.toLocaleTimeString();



    setText(
        "time",
        text
    );



}



setInterval(
    updateClock,
    1000
);









// =====================================================
// GPS
// =====================================================


function latestGPS(){



    return [

        ...DATA

    ]

    .reverse()

    .find(

        item =>

        item.x!==null &&

        item.y!==null

    );



}









function gpsStatus(value){



    if(value==="O"){


        return "ONLINE";


    }


    if(value==="N"){


        return "NO FIX";


    }


    if(value==="S"){


        return "STANDBY";


    }


    if(value==="E"){


        return "ERROR";


    }



    return show(value);



}









function updateGPS(){



    let gps =
    latestGPS();



    if(!gps){

        return;

    }






    setText(

        "latitude",

        gps.x.toFixed(6)+"°"

    );




    setText(

        "longitude",

        gps.y.toFixed(6)+"°"

    );





    setText(

        "satellites",

        show(gps.n)

    );









    setText(

        "latitudePage",

        gps.x.toFixed(6)+"°"

    );





    setText(

        "longitudePage",

        gps.y.toFixed(6)+"°"

    );





    setText(

        "satellitesPage",

        show(gps.n)

    );








    setText(

        "gpsStatusPage",

        gpsStatus(gps.g)

    );



}









// =====================================================
// MAP
// =====================================================


function initMap(){



    let box =
    document.getElementById(
        "worldMap"
    );



    if(!box){

        return;

    }



    let gps =
    latestGPS();



    let lat =
    gps ? gps.x : 0;



    let lon =
    gps ? gps.y : 0;





    map =
    L.map(
        "worldMap"
    )

    .setView(

        [
            lat,
            lon
        ],

        5

    );







    L.tileLayer(

        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

        {

            maxZoom:18,

            attribution:
            "© OpenStreetMap"

        }


    )

    .addTo(map);







    if(gps){



        markerA01 =

        L.marker(

            [
                gps.x,
                gps.y
            ]

        )

        .addTo(map);



        markerA01.bindPopup(

            `

            <b>
            ANT-A01
            </b>

            <br>

            LAT:
            ${gps.x}

            <br>

            LON:
            ${gps.y}

            `


        );



    }



}









function updateMap(){



    if(!map){


        initMap();


        return;


    }




    let gps =
    latestGPS();



    if(!gps){

        return;

    }




    if(markerA01){


        markerA01.setLatLng(

            [

            gps.x,

            gps.y

            ]

        );


    }



}









// =====================================================
// DASHBOARD
// =====================================================


function updateDashboard(){



    let d =
    latest();



    if(!d){

        return;

    }





    // MODE N/S/E


    setText(

        "systemMode",

        show(d.mode)

    );







    // Power


    setText(

        "voltage",

        show(
            d.v,
            " V"
        )

    );





    setText(

        "current",

        show(
            d.a,
            " mA"
        )

    );





    setText(

        "solar",

        show(
            d.s,
            " W/m²"
        )

    );









    // RS485 cabin


    setText(

        "insideTemp",

        show(
            d.t,
            " ℃"
        )

    );



    setText(

        "insideHum",

        show(
            d.h,
            " %"
        )

    );







    // SHT35 outside


    setText(

        "outsideTemp",

        show(
            d.j,
            " ℃"
        )

    );



}








// =====================================================
// ANALYSIS DATA
// =====================================================


function updateAnalysis(){



    if(DATA.length===0){

        return;

    }





    let first =

    new Date(

        DATA[0].time

    );



    let last =

    new Date(

        DATA[
            DATA.length-1
        ].time

    );



    let days =

    Math.floor(

        (

        last-first

        )

        /

        (

        1000*

        60*

        60*

        24

        )

    );





    setText(

        "runDays",

        days

    );





    setText(

        "dataCount",

        DATA.length

    );





    setText(

        "lastUpdate",

        latest().time

    );

// =====================================================
// SENSOR CHART
// =====================================================


function createChart(
    id,
    title,
    values,
    zero=false
){



    let canvas =
    document.getElementById(id);



    if(!canvas){

        return;

    }




    // 防止重复生成

    let exist =
    Chart.getChart(canvas);



    if(exist){

        exist.destroy();

    }






    let chart =

    new Chart(

        canvas,

        {


        type:"line",



        data:{



            labels:

            DATA.map(

                item =>

                item.time.substring(
                    11,
                    16
                )

            ),



            datasets:[

            {


            label:title,


            data:values,


            borderColor:"#67d5ff",


            backgroundColor:
            "rgba(103,213,255,0.1)",


            borderWidth:2,


            pointRadius:2,


            tension:.35



            }


            ]



        },




        options:{


            responsive:true,


            maintainAspectRatio:false,



            plugins:{


                legend:{


                    labels:{


                        color:"#dff6ff"


                    }


                }


            },





            scales:{



                x:{


                    ticks:{


                        color:"#91aabd",


                        maxTicksLimit:12


                    }



                },





                y:{



                    beginAtZero:

                    zero,



                    ticks:{


                        color:"#91aabd"


                    }



                }



            }




        }



        }



    );



}









function createSensorCharts(){



    createChart(

        "chartInTemp",

        "CABIN TEMPERATURE",

        DATA.map(

            d=>d.t

        ),

        false

    );





    createChart(

        "chartInHum",

        "CABIN HUMIDITY",

        DATA.map(

            d=>d.h

        ),

        false

    );






    createChart(

        "chartOutTemp",

        "OUTSIDE TEMPERATURE",

        DATA.map(

            d=>d.j

        ),

        false

    );







    createChart(

        "chartOutHum",

        "OUTSIDE HUMIDITY",

        DATA.map(

            d=>d.k

        ),

        false

    );







    // 太阳辐射 从0开始


    createChart(

        "chartSolar",

        "SOLAR IRRADIANCE",

        DATA.map(

            d=>d.s

        ),

        true

    );








    // 电流 从0开始


    createChart(

        "chartCurrent",

        "CURRENT",

        DATA.map(

            d=>d.a

        ),

        true

    );







    createChart(

        "chartVoltage",

        "VOLTAGE",

        DATA.map(

            d=>d.v

        ),

        false

    );







    // 风速暂无数据


    createChart(

        "chartWind",

        "WIND SPEED",

        DATA.map(

            d=>null

        ),

        true

    );



}









// =====================================================
// TELEMETRY STREAM
// =====================================================


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



        let item =

        document.createElement(

            "div"

        );



        item.className=

        "telemetry-item";





        item.innerHTML=



        `

        <h3>

        ${d.time}

        </h3>



        <p>

        VOLTAGE :

        ${show(d.v," V")}

        </p>



        <p>

        CURRENT :

        ${show(d.a," mA")}

        </p>




        <p>

        SOLAR :

        ${show(d.s," W/m²")}

        </p>




        <p>

        CABIN TEMP :

        ${show(d.t," ℃")}

        </p>




        <p>

        OUTSIDE TEMP :

        ${show(d.j," ℃")}

        </p>



        `;



        box.appendChild(item);



        }


    );



}









// =====================================================
// HARDWARE DIGITAL TWIN
// =====================================================


function updateHardware(){



    let d =
    latest();



    if(!d){

        return;

    }





    setText(

        "hardwareSolar",

        show(
            d.s,
            " W/m²"
        )

    );





    setText(

        "hardwareVoltage",

        show(
            d.v,
            " V"
        )

    );





    setText(

        "hardwareTemp",

        show(
            d.t,
            " ℃"
        )

    );






    let gps =
    latestGPS();




    if(gps){


        setText(

            "hardwareGPS",

            "ONLINE"

        );


    }



}









// =====================================================
// UPDATE ALL
// =====================================================


function updateAll(){



    updateClock();



    updateDashboard();



    updateGPS();



    updateMap();



    updateAnalysis();



    updateTelemetry();



    updateHardware();



    setTimeout(

        createSensorCharts,

        300

    );



}









// =====================================================
// START
// =====================================================


window.onload=function(){



    updateClock();


    loadData();



};

}
