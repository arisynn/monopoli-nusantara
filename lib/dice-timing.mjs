export function diceTiming({fast=false,reduced=false}={}){return reduced?{roll:80,settle:80}:fast?{roll:300,settle:180}:{roll:700,settle:340}}
export function playerColumns(count){return count<=2||count===4?2:3}
