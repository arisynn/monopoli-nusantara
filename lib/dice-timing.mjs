export function diceTiming({fast=false,reduced=false}={}){return reduced?{roll:0,settle:220}:fast?{roll:420,settle:240}:{roll:900,settle:450}}
export function playerColumns(count){return count<=2||count===4?2:3}
