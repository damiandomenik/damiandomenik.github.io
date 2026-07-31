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


        let types = [
            "block",
            "laser"
        ];


        let type = types[
            Phaser.Math.Between(
                0,
                types.length - 1
            )
        ];



        let obstacle = new Obstacle(
            this.scene,
            1400,
            490,
            type
        );



        this.obstacles.push(
            obstacle
        );



        this.group.add(
            obstacle.sprite
        );


    }



    update(speed){


        this.obstacles.forEach(

            o=>{


                o.sprite.x -= speed * 0.015;



                if(o.sprite.x < -200){

                    o.sprite.destroy();

                }


            }

        );


    }


}
