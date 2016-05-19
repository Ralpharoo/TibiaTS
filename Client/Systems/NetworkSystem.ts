﻿import {World, Events} from "../World";
import {
    Componenets, InputComponent, MovementComponent, PositionComponent, HealthComponent,
    SpriteComponent, CharacterAnimationComponent, SimpleAnimationComponent, CameraComponent, CharacterMessageComponent,
    RenderMapComponent

} from "../BasicComponents";

import {config} from "../Init";
import * as SocketIO from 'socket.io-client';
import GameObj from "../GameObj";

﻿
export default class NetworkSystem {
    private socket:SocketIOClient.Socket;
    private newEntityList = [];
    private EntityToRemove = [];
    private entityToModification = new Array< { ID; Type; Data; }>();

    connect(url = null) {
        if (!url) {
            this.socket = SocketIO.connect();
        } else {
            this.socket = SocketIO.connect(url);
        }

        this.Setup();
    }

    Process(world:World) {
        for (var i = 0; i < this.newEntityList.length; i++) {
            world.Add(this.newEntityList[i]);
        }

        for (var i = 0; i < this.EntityToRemove.length; i++) {

            var removed = world.RemoveEntity(this.EntityToRemove[i]);
            if (removed && removed.ComponentList[Componenets.Camera]) {
                removed.ComponentList[Componenets.Sprite] = null;
                removed.ComponentList[Componenets.CharacterAnimation] = null;
                removed.ComponentList[Componenets.Health] = null;
                (<InputComponent>removed.ComponentList[Componenets.Input]).IsAlive = false;
                (<MovementComponent>removed.ComponentList[Componenets.Movement]).Speed = 1000;
                document.body.style.backgroundColor = "black";
                world.Add(removed);
            }
        }

        this.ProcessEvents(world);
        this.ModifyEntities(world);

        this.cleanup();

    }

    private Setup() {
        this.socket.on("NewCharacters", (data:NewCharacterData[]) => {
            for (var i = 0; i < data.length; i++) {
                var gameObj = new GameObj();
                gameObj.ID = data[i].ID;
                gameObj.AddComponent(new PositionComponent(data[i].Position.x, data[i].Position.y, Rotation.Down));
                gameObj.AddComponent(new MovementComponent(data[i].Speed));
                gameObj.AddComponent(new HealthComponent(data[i].HP, data[i].MaxHP));
                gameObj.AddComponent(new SpriteComponent(config.Mobs[data[i].Race].AliveSprites[0], {
                    x: 0,
                    y: 0
                }, config.ZIndexes.Character));
                gameObj.AddComponent(new CharacterAnimationComponent(config.Mobs[data[i].Race].AliveSprites, 5));
                this.newEntityList.push(gameObj);

                var animation = new GameObj();
                animation.ID = Math.random();
                animation.AddComponent(new PositionComponent(data[i].Position.x, data[i].Position.y));
                animation.AddComponent(new SpriteComponent(config.Animations.Beam.Sprites[0]));
                animation.AddComponent(new SimpleAnimationComponent(config.Animations.Beam.Sprites, false, 4));
                this.newEntityList.push(animation);
            }
        });

        this.socket.on("PlayerStart", (data:NewCharacterData) => {
            var gameObj = new GameObj();
            gameObj.ID = data.ID;
            gameObj.AddComponent(new PositionComponent(data.Position.x, data.Position.y, Rotation.Down));
            gameObj.AddComponent(new MovementComponent(data.Speed));
            gameObj.AddComponent(new CharacterAnimationComponent(config.Mobs[data.Race].AliveSprites, 5));
            gameObj.AddComponent(new SpriteComponent(config.Mobs[data.Race].AliveSprites[0], {
                x: 0,
                y: 0
            }, config.ZIndexes.Character));
            var input = new InputComponent();
            input.Level = data.Level;
            gameObj.AddComponent(input);
            gameObj.AddComponent(new HealthComponent(data.HP, data.MaxHP));
            gameObj.AddComponent(new CameraComponent());
            this.newEntityList.push(gameObj);

            console.log("New Player");
        });

        this.socket.on("MapUpdate", (data:Uint16Array) => {
            console.log(data);
            this.entityToModification.push({ID: 1995, Type: ModType.MapUpdate, Data: data});
        });

        this.socket.on("CharacterMessage", (data:{ Msg:string, ID }) => {
            this.entityToModification.push({ID: data.ID, Type: ModType.Message, Data: data.Msg});
        });

        this.socket.on("CharacterMove", (data:{ ID; Data:MoveData }) => {
            this.entityToModification.push({ID: data.ID, Type: ModType.Move, Data: data.Data});
        });

        this.socket.on("CharacterTeleport", (data:{ ID; Data:MoveData }) => {
            this.entityToModification.push({ID: data.ID, Type: ModType.Teleport, Data: data.Data});
        });

        this.socket.on("ApplyDommage", (data:{ AttackType:number; AttarckerID; TargetID; HitPoints:number }) => {
            this.entityToModification.push({ID: data.TargetID, Type: ModType.Hit, Data: data.HitPoints});
        });

        this.socket.on("ApplyExperience", (data:{ ID; Exp:number }) => {
            this.entityToModification.push({ID: data.ID, Type: ModType.Exp, Data: data});
        });

        this.socket.on("SpawnProjectile", (data) => {
            var gameObj = new GameObj();
            gameObj.ID = Math.random();
            gameObj.AddComponent(new PositionComponent(data.StartPos.x, data.StartPos.y, Rotation.Down));
            var movementComponet = new MovementComponent();
            movementComponet.RemoveOnDone = true;
            movementComponet.SetTarget(data.TargetPos.x, data.TargetPos.y);
            movementComponet.Speed = 1000;
            gameObj.AddComponent(movementComponet);
            gameObj.AddComponent(new SpriteComponent(44));
            this.newEntityList.push(gameObj);
        });

        this.socket.on("Animation", (data) => {
            var gameObj = new GameObj();
            gameObj.ID = Math.random();
            gameObj.AddComponent(new PositionComponent(data.Pos.x, data.Pos.y));
            gameObj.AddComponent(new SimpleAnimationComponent(data.Sprites, false, data.TicksPerFrame));
            gameObj.AddComponent(new SpriteComponent(data.Sprites[0], {x: 0, y: 0}, data.z));
            console.log(data);
            this.newEntityList.push(gameObj);

        });


        this.socket.on("DeleteCharacters", (data:any[]) => {

            for (var i = 0; i < data.length; i++) {
                this.EntityToRemove.push(data[i]);
            }
        });
    }

    private ProcessEvents(world:World) {
        var plrMoveEventList = world.GetEventByType(Events.PlayerMove);
        plrMoveEventList.forEach((value) => {
            for (var i = 0; i < plrMoveEventList.length; i++) {
                this.socket.emit("PlayerMove", plrMoveEventList[i].Payload);
            }
        });

        var msgEventList = world.GetEventByType(Events.PlayerMessage);
        for (var i = 0; i < msgEventList.length; i++) {
            this.socket.emit("PlayerMessage", {Msg: msgEventList[i].Payload});
        }

        var targetEventList = world.GetEventByType(Events.PlayerTarget);
        for (var i = 0; i < targetEventList.length; i++) {
            this.socket.emit("PlayerTarget", targetEventList[i].Payload);
        }
    }

    private ModifyEntities(world:World) {
        var gameObjList = world.entityList;
        for (var j = 0; j < gameObjList.length; j++) {
            var movement = <MovementComponent>gameObjList[j].ComponentList[Componenets.Movement];
            var position = <PositionComponent>gameObjList[j].ComponentList[Componenets.Position];

            for (var i = 0; i < this.entityToModification.length; i++) {
                if (this.entityToModification[i].ID !== gameObjList[j].ID) continue;
                var modyfication = this.entityToModification.splice(i, 1)[0];
                if (modyfication.Type === ModType.Move) {
                    if (!movement) continue;
                    movement.SetTarget(modyfication.Data.Pos.x, modyfication.Data.Pos.y);
                    position.Rotation = modyfication.Data.Rot;
                }

                if (modyfication.Type === ModType.Teleport) {
                    if (!movement) continue;
                    movement.IsMoving = false;
                    movement.SetTarget(modyfication.Data.Pos.x, modyfication.Data.Pos.y);
                    position.SetPosition(modyfication.Data.Pos.x, modyfication.Data.Pos.y);
                }

                if (modyfication.Type === ModType.Message) {
                    var chMsg = <CharacterMessageComponent>gameObjList[j].ComponentList[Componenets.CharacterMessage];
                    if (!chMsg) {
                        gameObjList[j].AddComponent(new CharacterMessageComponent(modyfication.Data));
                    } else {
                        chMsg.Str = modyfication.Data;
                    }

                }

                if (modyfication.Type === ModType.Hit) {
                    var healthComponent = <HealthComponent>gameObjList[j].ComponentList[Componenets.Health];
                    if (healthComponent) {
                        healthComponent.LoseHP(modyfication.Data);
                        world.PushEvent(gameObjList[j], Events.TxtSpawn, {
                            Str: modyfication.Data.toString(),
                            Color: "Red"
                        });

                    }
                }

                if (modyfication.Type === ModType.Exp) {
                    var inputComponent = <InputComponent>gameObjList[j].ComponentList[Componenets.Input];
                    if (inputComponent) {
                        world.PushEvent(gameObjList[j], Events.TxtSpawn, {
                            Str: modyfication.Data.Exp.toString(),
                            Color: "White"
                        });
                        if (modyfication.Data.NextLvl) {
                            inputComponent.Level = modyfication.Data.NextLvl;
                            inputComponent.Experience = 0;
                        } else {
                            inputComponent.Experience += modyfication.Data.Exp;
                        }
                    }
                }

                if (modyfication.Type === ModType.MapUpdate) {
                    var mapComponent = <RenderMapComponent>gameObjList[j].ComponentList[Componenets.RenderMap];
                    if (mapComponent) {
                        var payload = <Int16Array> modyfication.Data;

                        if (payload.length < 5)
                            console.log("Bad map update: payload should be at least 5 elements long");

                        var fillRect = {x: payload[0], y: payload[1], width: payload[2], height: payload[3]};
                        var putPos = {x: fillRect.x, y: fillRect.y};

                        var offset = 4;

                        for (var i = 0; i < (fillRect.width * fillRect.height); i++) {
                            mapComponent.PutFloorTile(putPos.x, putPos.y, payload[i + offset]);
                            putPos.x++;
                            if (putPos.x >= fillRect.x + fillRect.width) {
                                putPos.x = fillRect.x;
                                putPos.y++;
                                if (putPos.y > fillRect.y + fillRect.height)
                                    return;
                            }
                        }

                        putPos.x = fillRect.x;
                        putPos.y = fillRect.y;

                        offset = offset + (fillRect.width * fillRect.height);
                        for (var i = 0; i < (fillRect.width * fillRect.height); i++) {
                            mapComponent.PutDecorationTile(putPos.x, putPos.y, payload[i + offset]);
                            putPos.x++;
                            if (putPos.x >= fillRect.x + fillRect.width) {
                                putPos.x = fillRect.x;
                                putPos.y++;
                                if (putPos.y > fillRect.y + fillRect.height)
                                    return;
                            }
                        }
                    }
                }
            }
        }

    }


    private cleanup() {
        this.newEntityList = [];
        this.entityToModification = [];
        this.EntityToRemove = [];
    }
}

const enum ModType { Move, Teleport, Message, Hit, Exp, MapUpdate }
;