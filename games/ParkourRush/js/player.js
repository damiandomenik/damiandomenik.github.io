export default class Player{


constructor(scene,x,y){


this.scene = scene;


this.sprite = scene.add.rectangle(
    x,
    y,
    45,
    60,
    0x00ffff
);


scene.physics.add.existing(
    this.sprite
);


this.sprite.body.setCollideWorldBounds(true);


}



update(keys){


if(
keys.jump.isDown &&
this.sprite.body.blocked.down
){

this.sprite.body.setVelocityY(-600);

}


if(keys.duck.isDown){

this.sprite.height = 30;

}
else{

this.sprite.height = 60;

}


}


}
