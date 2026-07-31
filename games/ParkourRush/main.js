import Player from "./js/player.js";
import World from "./js/world.js";
import UI from "./js/ui.js";


class ParkourRush extends Phaser.Scene {

    constructor(){
        super("game");
    }


    preload(){

    }


    create(){

        this.speed = 250;
        this.distance = 0;

        this.cameras.main.setBackgroundColor("#080820");


        this.ui = new UI(this);


        this.player = new Player(
            this,
            200,
            450
        );


        this.world = new World(this);


        this.keys = this.input.keyboard.addKeys({
            jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
            duck: Phaser.Input.Keyboard.KeyCodes.DOWN
        });


        this.ui.showStart();


        this.time.delayedCall(
            3000,
            ()=>{
                this.startGame();
            }
        );

    }



    startGame(){

        this.running=true;

        this.ui.hide();

    }



    update(time,delta){


        if(!this.running)
            return;


        this.distance += this.speed * delta/1000;


        this.world.update(
            this.speed
        );


        this.player.update(
            this.keys
        );


        this.ui.updateDistance(
            Math.floor(this.distance)
        );


    }

}



const config={

    type:Phaser.AUTO,

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