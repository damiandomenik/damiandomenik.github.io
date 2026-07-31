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
        this.gameOver = false;


        this.cameras.main.setBackgroundColor("#050014");



        // Sterne Hintergrund
        for(let i = 0; i < 80; i++){

            let star = this.add.circle(
                Phaser.Math.Between(0,1200),
                Phaser.Math.Between(0,600),
                Phaser.Math.Between(1,3),
                0x8844ff
            );

            star.alpha = 0.5;

        }



        // Boden
        this.ground = this.add.rectangle(
            600,
            580,
            1200,
            50,
            0x221155
        );


        this.ground.setStrokeStyle(
            4,
            0x00ffff
        );


        this.physics.add.existing(
            this.ground,
            true
        );



        // Spieler
        this.player = new Player(
            this,
            200,
            450
        );



        this.physics.add.collider(
            this.player.sprite,
            this.ground
        );



        // Welt erstellen
        this.world = new World(this);



        // UI erstellen
        this.ui = new UI(this);



        // Hindernis-Kollision
        this.physics.add.collider(
            this.player.sprite,
            this.world.group,
            ()=>{
                this.endGame();
            }
        );



this.keys = this.input.keyboard.addKeys({

    jump: Phaser.Input.Keyboard.KeyCodes.SPACE,

    duck: Phaser.Input.Keyboard.KeyCodes.DOWN,

    restart: Phaser.Input.Keyboard.KeyCodes.R

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





    endGame(){


        if(this.gameOver)
            return;



        this.gameOver = true;

        this.running = false;



        this.player.sprite.setFillStyle(
            0x555555
        );



        this.ui.showGameOver(
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
