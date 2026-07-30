let DATA = [];

let trendChart = null;



// ===============================
// 加载数据
// ===============================

async function loadData(){

    try{

        const response = await fetch("../data.json");

        DATA = await response.json();


        updateDashboard();

        createTrendChart();


    }catch(error){

        console.error(
            "DATA LOAD ERROR:",
            error
        );

    }

}





// ===============================
// NULL处理
// ===============================

function formatValue(value, unit=""){


    if(value === null || value === undefined){

        return "NULL";

    }


    return value + unit;

}






// ===============================
// 获取最新数据
// ===============================


function getLatest(){


    if(DATA.length === 0){

        return null;

    }


    return DATA[DATA.length-1];


}








// ===============================
// GPS专用
// 最近有效GPS
// ===============================


function getLatestGPS(){



    return [...DATA]

    .reverse()

    .find(item=>


        item.x !== null &&

        item.x !== undefined &&


        item.y !== null &&

        item.y !== undefined


    );



}









// ===============================
// 电池SOC计算
// v为空保持NULL
// ===============================


function calculateBattery(voltage){



    if(voltage===null || voltage===undefined){

        return "NULL";

    }



    if(voltage>=12.7){

        return 100;

    }


    if(voltage>=12.5){

        return 85;

    }


    if(voltage>=12.3){

        return 65;

    }


    if(voltage>=12.1){

        return 45;

    }


    if(voltage>=11.9){

        return 25;

    }


    return 10;



}









// ===============================
// 首页数据更新
// ===============================


function updateDashboard(){



    const last = getLatest();


    if(!last){

        return;

    }





    // 当前温度
    // 仓内温度 t

    document.getElementById(
        "currentTemp"
    ).innerHTML =

    formatValue(
        last.t,
        " ℃"
    );





    // 电压

    document.getElementById(
        "voltage"
    ).innerHTML =

    formatValue(
        last.v,
        " V"
    );





    // 电池百分比

    let soc = calculateBattery(last.v);



    document.getElementById(
        "batterySOC"
    ).innerHTML =

    soc==="NULL"

    ?

    "NULL"

    :

    soc+"%";






    if(soc!=="NULL"){


        document.getElementById(
            "batteryProgress"
        ).style.width =

        soc+"%";


    }





    // 电流

    document.getElementById(
        "current"
    ).innerHTML =

    formatValue(
        last.a,
        ""
    );






    // 太阳辐射

    document.getElementById(
        "solar"
    ).innerHTML =

    formatValue(
        last.s,
        ""
    );







    // 仓内温度

    document.getElementById(
        "insideTemp"
    ).innerHTML =

    formatValue(
        last.t,
        ""
    );







    // 仓内湿度

    document.getElementById(
        "insideHum"
    ).innerHTML =

    formatValue(
        last.h,
        ""
    );






    // 舱外温度 SHT35

    document.getElementById(
        "outsideTemp"
    ).innerHTML =

    formatValue(
        last.j,
        ""
    );









    // GPS

    updateGPS();



}









// ===============================
// GPS更新
// ===============================


function updateGPS(){



    let gps = getLatestGPS();



    if(!gps){

        return;

    }





    document.getElementById(
        "latitude"
    ).innerHTML =


    gps.x.toFixed(6)+"°";







    document.getElementById(
        "longitude"
    ).innerHTML =


    gps.y.toFixed(6)+"°";







    document.getElementById(
        "satellites"
    ).innerHTML =


    formatValue(
        gps.n
    );



}









// ===============================
// 时间
// ===============================


function updateClock(){


    let now = new Date();


    document.getElementById(
        "time"
    ).innerHTML =


    now.toLocaleTimeString();



}



setInterval(
    updateClock,
    1000
);








// ===============================
// 趋势图
// ===============================


function createTrendChart(){



    const canvas = document.getElementById(
        "trendChart"
    );



    if(!canvas){

        return;

    }




    if(trendChart){

        trendChart.destroy();

    }





    trendChart = new Chart(

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

            borderColor:"#1769AA",

            tension:.3


            },



            {


            label:"Voltage",

            data:

            DATA.map(item=>

                item.v

            ),


            borderColor:"#1F9D68",


            tension:.3


            },



            {


            label:"Solar",


            data:

            DATA.map(item=>

                item.s

            ),



            borderColor:"#F59E0B",



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


}









window.onload=function(){


    loadData();


}
