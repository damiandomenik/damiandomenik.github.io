import Obstacle from "./obstacle.js";


export default class World {


    constructor(scene){

        this.scene = scene;

        this.obstacles = [];

        this.group = scene.physics.add.group();


        scene.time.addEvent({

            delay:2000,

            loop:true,

            callback:()=>{

                this.spawn();

            }

        });

    }



    spawn(){


        console.log("HINDERNIS SPAWN");


        let obstacle = new Obstacle(
            this.scene,
            900,
            500,
            "block"
        );


        this.obstacles.push(obstacle);


        this.group.add(
            obstacle.sprite
        );


    }



    update(speed){


        this.obstacles.forEach(o=>{


            o.sprite.x -= 2;


        });


    }


}
