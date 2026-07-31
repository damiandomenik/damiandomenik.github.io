import Player from "./js/player.js";
import World from "./js/world.js";
import UI from "./js/ui.js";


class ParkourRush extends Phaser.Scene {

    constructor(){
        super("game");
    }


    create(){

        this.running = false;
        this.distance = 0;
        this.speed = 300;


        this.cameras.main.setBackgroundColor("#080820");


        // Boden
        this.ground = this.add.rectangle(
            600,
            580,
            1200,
            40,
            0x111133
        );


        this.physics.add.existing(
            this.ground,
            true
        );


        this.player = new Player(
            this,
            200,
            450
        );


        this.physics.add.collider(
            this.player.sprite,
            this.ground
        );


        this.world = new World(this);


        this.ui = new UI(this);


        this.keys = this.input.keyboard.addKeys({
            jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
            duck: Phaser.Input.Keyboard.KeyCodes.DOWN
        });


        this.ui.showStart();


        this.time.delayedCall(
            3000,
            ()=>{
                this.running = true;
                this.ui.hide();
            }
        );

    }



    update(time,delta){


        if(!this.running)
            return;


        this.distance += delta / 100;


        this.player.update(
            this.keys
        );


        this.world.update(
            this.speed
        );


        this.ui.updateDistance(
            Math.floor(this.distance)
        );


    }

}



const config = {

    type: Phaser.AUTO,

    width:1200,

    height:600,

    parent:"game",

    physics:{
        default:"arcade",
        arcade:{
            gravity:{
                y:1200
            },
            debug:false
        }
    },

    scene:ParkourRush

};


new Phaser.Game(config);
