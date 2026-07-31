import Obstacle from "./obstacle.js";


export default class World{


constructor(scene){

    this.scene = scene;

    this.obstacles = [];

    this.group = scene.physics.add.group();


    scene.time.addEvent({

        delay:1500,

        loop:true,

        callback:()=>{

            this.spawn();

        }

    });


}



spawn(){


    let types=[
        "block",
        "laser"
    ];


    let type =
    types[
        Phaser.Math.Between(
            0,
            types.length-1
        )
    ];


    let obstacle = new Obstacle(
        this.scene,
        1250,
        520,
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

            o.sprite.x -= speed * 0.008;

        }
    );


}


}
