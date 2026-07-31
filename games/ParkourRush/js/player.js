export default class Player {


constructor(scene,x,y){


this.sprite = scene.add.rectangle(
    x,
    y,
    45,
    65,
    0x00ffff
);


this.sprite.setStrokeStyle(
    4,
    0xffffff
);



scene.physics.add.existing(
    this.sprite
);


this.sprite.body.setCollideWorldBounds(true);



scene.tweens.add({

targets:this.sprite,

scaleX:1.05,
scaleY:1.05,

duration:500,

yoyo:true,

repeat:-1

});


}



update(keys){



if(
keys.jump.isDown &&
this.sprite.body.blocked.down
){

this.sprite.body.setVelocityY(-650);


}



if(keys.duck.isDown){

this.sprite.height=35;

}
else{

this.sprite.height=65;

}


}



}
