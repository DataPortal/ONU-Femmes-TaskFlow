let tasks=[]

async function loadTasks(){

const response=await fetch('data/tasks.json')
tasks=await response.json()

renderTasks(tasks)
updateDashboard()

}

function renderTasks(data){

const table=document.querySelector("#taskTable tbody")
table.innerHTML=""

data.forEach(task=>{

let today=new Date()
let due=new Date(task.due_date)

let late = due < today && task.status !== "Terminée"

const row=document.createElement("tr")

row.innerHTML=`

<td>${task.id}</td>
<td>${task.title}</td>
<td>${task.pillar}</td>
<td>${task.assigned_to}</td>
<td>${task.priority}</td>

<td>
<select onchange="changeStatus(${task.id},this.value)">
<option ${task.status=="Non commencée"?"selected":""}>Non commencée</option>
<option ${task.status=="En cours"?"selected":""}>En cours</option>
<option ${task.status=="Terminée"?"selected":""}>Terminée</option>
</select>
</td>

<td>

<div class="progressBar">
<div class="progress" style="width:${task.progress}%"></div>
</div>

${task.progress}%

</td>

<td ${late ? "style='color:red'" : ""}>${task.due_date}</td>

`

table.appendChild(row)

})

}

function updateDashboard(){

document.getElementById("totalTasks").innerText=tasks.length

document.getElementById("inProgress").innerText=
tasks.filter(t=>t.status=="En cours").length

document.getElementById("completed").innerText=
tasks.filter(t=>t.status=="Terminée").length

document.getElementById("late").innerText=
tasks.filter(t=>new Date(t.due_date)<new Date() && t.status!="Terminée").length

}

function changeStatus(id,value){

const task=tasks.find(t=>t.id==id)

task.status=value

if(value=="Terminée") task.progress=100

renderTasks(tasks)
updateDashboard()

}

function searchTasks(){

const text=document.getElementById("searchInput").value.toLowerCase()

const filtered=tasks.filter(t=>t.title.toLowerCase().includes(text))

renderTasks(filtered)

}

function filterPillar(){

const pillar=document.getElementById("pillarFilter").value

const filtered=tasks.filter(t=>t.pillar==pillar || pillar=="")

renderTasks(filtered)

}

document.getElementById("searchInput").addEventListener("keyup",searchTasks)

document.getElementById("pillarFilter").addEventListener("change",filterPillar)

function openForm(){
document.getElementById("taskForm").style.display="block"
}

function closeForm(){
document.getElementById("taskForm").style.display="none"
}

function addTask(){

const newTask={
id:tasks.length+1,
title:document.getElementById("title").value,
pillar:document.getElementById("pillar").value,
assigned_to:document.getElementById("assigned").value,
priority:document.getElementById("priority").value,
status:"Non commencée",
progress:0,
due_date:document.getElementById("date").value
}

tasks.push(newTask)

renderTasks(tasks)
updateDashboard()

closeForm()

}

loadTasks()
