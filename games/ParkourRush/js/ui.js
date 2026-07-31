export default class UI {


    constructor(scene){

        this.scene = scene;


        this.text = scene.add.text(
            20,
            20,
            "",
            {
                fontSize: "32px",
                fill: "#ffffff"
            }
        );

    }



    showStart(){

        this.text.setText(
            "READY...\n\n3\n2\n1\nGO!"
        );

    }



    hide(){

        this.text.setText("");

    }



    updateDistance(distance){

        this.text.setText(
            "Distance: " + distance + " m"
        );

    }

showGameOver(distance){

    this.text.setText(
`
GAME OVER

Distance:
${distance} m

Press R to restart
`
    );

}
}
