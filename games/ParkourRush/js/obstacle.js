export default class Obstacle {


    constructor(scene,x,y,type){


        this.sprite = scene.add.rectangle(
            x,
            y,
            80,
            80,
            0xff0000
        );


        scene.physics.add.existing(
            this.sprite,
            true
        );


    }


}
