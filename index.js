const button = document.getElementById('locate_button');
button.addEventListener('click', (e)=>{
  e.preventDefault();
  $.get('http://ip-api.com/json',(data) => {
      consoleData(data);
    });
});

function consoleData(data){
  let pos = [data.lat, data.lon];

}
