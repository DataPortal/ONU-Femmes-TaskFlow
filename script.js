
async function loadTasks(){

const response = await fetch('data/tasks.json')

const tasks = await response.json()

displayTasks(tasks)

updateDashboard(tasks)

}

function displayTasks(tasks){

const table = document.querySelector("#taskTable tbody")

table.innerHTML=""

tasks.forEach(task =>{

const row = document.createElement("tr")

row.innerHTML = `

<td>${task.id}</td>
<td>${task.title}</td>
<td>${task.pillar}</td>
<td>${task.assigned_to}</td>
<td>${task.priority}</td>
<td>${task.status}</td>
<td>${task.progress}%</td>
<td>${task.due_date}</td>

`

table.appendChild(row)

})

}

function updateDashboard(tasks){

document.getElementById("totalTasks").textContent = tasks.length

const inProgress = tasks.filter(t => t.status==="En cours").length
const completed = tasks.filter(t => t.status==="Terminée").length

document.getElementById("inProgress").textContent = inProgress
document.getElementById("completed").textContent = completed

}

loadTasks()
