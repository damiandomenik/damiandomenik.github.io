export default class Player {


constructor(scene,x,y){


this.scene = scene;


this.sprite = scene.add.rectangle(
    x,
    y,
    45,
    65,
    0x00ffff
);


this.sprite.setStrokeStyle(
    3,
    0xffffff
);


scene.tweens.add({

targets:this.sprite,

scaleX:1.05,

scaleY:1.05,

duration:500,

yoyo:true,

repeat:-1

});



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

this.sprite.body.setVelocityY(-550);

}


if(keys.duck.isDown){

this.sprite.height=35;

}
else{

this.sprite.height=65;

}


}


}
