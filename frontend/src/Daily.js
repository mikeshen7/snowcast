import React from 'react';
import axios from 'axios';
import Table from 'react-bootstrap/Table';
import Form from 'react-bootstrap/Form';
import Icon from '../src/Icon';
import './Hourly.css';

class Daily extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      resortForecast: [],
    }
  }

  componentDidMount() {
  }

  getForecast = async (resort) => {
    try {
      let config = {
        method: 'GET',
        url: `${process.env.REACT_APP_SERVER}/dailyWeather/${resort}`,
      }

      let data = await axios(config);
      data = data.data;

      data.sort((a, b) => a.key > b.key ? 1 : -1);

      let currentDate;

      data = data.map((forecast) => {
        currentDate = new Date(forecast.dateTimeEpoch);
        forecast.dayOfWeek = currentDate.getDay() + 1;
        forecast.date = currentDate.getDate();
        forecast.month = currentDate.getMonth() + 1;
        forecast.year = currentDate.getFullYear();
        forecast.hour = currentDate.getUTCHours() - 8;
        forecast.min = currentDate.getMinutes();
        return forecast;
      });

      this.setState({
        resortForecast: data,
      })


    } catch (error) {
      console.log(error.message);
    }
  }

  handleResortSelect = async (event) => {
    event.preventDefault();
    this.getForecast(event.target.value);
  }


  render() {
    return (
      <>
        <div className="router-body">
          <Form.Control
            as='select'
            onChange={this.handleResortSelect}
          >
            <option>Select a Resort</option>
            {this.props.resorts.map((resort, index) => {
              return <option value={resort.name} key={index}>{resort.name}</option>
            })}
          </Form.Control>

          <div className='dailyForecastTable'>
            <Table bordered >
              <thead>
                <tr>
                  <th>Resort Name</th>
                  <th>Date</th>
                  <th>Icon</th>
                  <th>Temp</th>
                  <th>Snow</th>
                  <th>Precip Type</th>
                  <th>Wind Speed</th>
                  <th>Visibility</th>
                </tr>
              </thead>
              <tbody>
                {this.state.resortForecast.map((forecast, index) => {
                  return (
                    <tr key={index}>
                      <td>{forecast.resort}</td>
                      <td>{forecast.month}/{forecast.date}/{forecast.year} {forecast.dateTime} {forecast.time}</td>
                      <td>
                        <div>
                          <p>{forecast.icon} </p>
                          <img src={Icon(forecast.icon)} alt='forecast icon'></img>
                        </div>
                      </td>
                      <td>{forecast.temp.toFixed(1)} °F</td>
                      <td>{forecast.snow.toFixed(1)}"</td>
                      <td>{forecast.precipType}</td>
                      <td>{forecast.windspeed.toFixed(1)} mph</td>
                      <td>{forecast.visibility.toFixed(1)} miles</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        </div >
      </>
    );
  }
}

export default Daily;
