export default class Obstacle{


constructor(scene,x,y,type){


let color=0xff00aa;


if(type==="block")
color=0xff8800;


if(type==="laser")
color=0xff0000;


this.sprite=
scene.add.rectangle(
x,
y,
60,
90,
color
);


scene.physics.add.existing(
this.sprite
);


this.sprite.body.setVelocityX(-300);


}



update(){

if(this.sprite.x < -100){

this.sprite.destroy();

}

}


}
