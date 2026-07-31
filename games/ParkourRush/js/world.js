import Obstacle from "./obstacle.js";


export default class World {


    constructor(scene){

        this.scene = scene;

        this.obstacles = [];

        this.group = scene.physics.add.group();


        scene.time.addEvent({

            delay:3000,

            loop:true,

            callback:()=>{

                if(scene.running){

                    this.spawn();

                }

            }

        });

    }



    spawn(){


        let obstacle = new Obstacle(
            this.scene,
            1400,
            535,
            "block"
        );


        this.obstacles.push(obstacle);


        this.group.add(
            obstacle.sprite
        );


    }



    update(speed){


        this.obstacles.forEach(o=>{


            o.sprite.x -= 5;


        });


    }


}
