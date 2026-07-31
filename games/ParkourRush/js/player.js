export default class Player{


constructor(scene,x,y){

this.scene=scene;


this.sprite=
scene.add.rectangle(
x,
y,
40,
60,
0x00ffff
);


scene.physics.add.existing(
this.sprite
);


this.body=this.sprite.body;


this.body.setCollideWorldBounds(true);


this.jumping=false;


}



update(keys){


if(
keys.jump.isDown &&
this.body.blocked.down
){

this.body.setVelocityY(-550);

}


if(keys.duck.isDown){

this.sprite.height=30;

}
else{

this.sprite.height=60;

}


}



}