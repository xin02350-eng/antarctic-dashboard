let DATA = [];
let chart = null;


// =====================
// LOAD DATA
// =====================

async function loadData(){

    try{

        const response = await fetch("./data.json");

        if(!response.ok){

            throw new Error("data.json not found");

        }


        DATA = await response.json();


        console.log("DATA LOADED:", DATA);


        updateDashboard();

        createChart();


    }catch(error){

        console.error(error);

    }

}






// =====================
// NULL DISPLAY
// =====================

function show(value, unit=""){


    if(value === null || value === undefined){

        return "NULL";

    }


    return value + unit;

}







// =====================
// LAST DATA
// =====================

function latest(){

    if(DATA.length === 0){

        return null;

    }


    return DATA[DATA.length-1];

}








// =====================
// GPS LAST VALID
// =====================

function latestGPS(){


    return [...DATA]
    .reverse()
    .find(item =>

        item.x !== null &&
        item.y !== null

    );

}









// =====================
// DASHBOARD UPDATE
// =====================

function updateDashboard(){


    let d = latest();


    if(!d){

        return;

    }





    // 时间

    let time =
    document.getElementById("time");


    if(time){

        time.innerHTML =
        d.time.substring(11,19);

    }






    // 当前温度 t

    let temp =
    document.getElementById("currentTemp");


    if(temp){

        temp.innerHTML =
        show(d.t," ℃");

    }








    // 电压

    let voltage =
    document.getElementById("voltage");


    if(voltage){

        voltage.innerHTML =
        show(d.v," V");

    }






    // 电流

    let current =
    document.getElementById("current");


    if(current){

        current.innerHTML =
        show(d.a);

    }







    // 太阳辐射

    let solar =
    document.getElementById("solar");


    if(solar){

        solar.innerHTML =
        show(d.s);

    }








    // 仓内温度

    let insideTemp =
    document.getElementById("insideTemp");


    if(insideTemp){

        insideTemp.innerHTML =
        show(d.t);

    }








    // 仓内湿度

    let insideHum =
    document.getElementById("insideHum");


    if(insideHum){

        insideHum.innerHTML =
        show(d.h);

    }








    // 舱外温度 SHT35

    let outsideTemp =
    document.getElementById("outsideTemp");


    if(outsideTemp){

        outsideTemp.innerHTML =
        show(d.j);

    }






    updateGPS();


}









// =====================
// GPS UPDATE
// =====================

function updateGPS(){


    let gps = latestGPS();


    if(!gps){

        return;

    }



    let lat =
    document.getElementById("latitude");


    if(lat){

        lat.innerHTML =
        gps.x.toFixed(6);

    }





    let lon =
    document.getElementById("longitude");


    if(lon){

        lon.innerHTML =
        gps.y.toFixed(6);

    }






    let sat =
    document.getElementById("satellites");


    if(sat){

        sat.innerHTML =
        show(gps.n);

    }


}









// =====================
// CHART
// =====================

function createChart(){


    let canvas =
    document.getElementById("trendChart");



    if(!canvas){

        return;

    }




    if(chart){

        chart.destroy();

    }




    chart = new Chart(canvas,{


        type:"line",



        data:{


            labels:

            DATA.map(item=>

                item.time.substring(11,16)

            ),




            datasets:[


                {

                    label:"Temperature",

                    data:

                    DATA.map(item=>

                        item.t

                    )

                },



                {

                    label:"Solar",

                    data:

                    DATA.map(item=>

                        item.s

                    )

                },



                {

                    label:"Voltage",

                    data:

                    DATA.map(item=>

                        item.v

                    )

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







// =====================
// START
// =====================


window.onload=function(){

    loadData();

};
