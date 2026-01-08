import React from 'react';
import axios from 'axios';
import Form from 'react-bootstrap/Form';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import './Grid.css';

class Grid extends React.Component {
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

          <Container>
            {this.state.resortForecast.length === 0
              ? null
              : <Row>
                <Col>{this.state.resortForecast[0].month}/{this.state.resortForecast[0].date}/{this.state.resortForecast[0].year}</Col>
                <Col>{this.state.resortForecast[2].month}/{this.state.resortForecast[2].date}/{this.state.resortForecast[2].year}</Col>
                <Col>{this.state.resortForecast[5].month}/{this.state.resortForecast[5].date}/{this.state.resortForecast[5].year}</Col>
                <Col>{this.state.resortForecast[8].month}/{this.state.resortForecast[8].date}/{this.state.resortForecast[8].year}</Col>
                <Col>{this.state.resortForecast[11].month}/{this.state.resortForecast[11].date}/{this.state.resortForecast[11].year}</Col>
                <Col>{this.state.resortForecast[14].month}/{this.state.resortForecast[14].date}/{this.state.resortForecast[14].year}</Col>
                <Col>{this.state.resortForecast[17].month}/{this.state.resortForecast[17].date}/{this.state.resortForecast[17].year}</Col>
              </Row>
            }


          </Container>

        </div >
      </>
    );
  }
}

export default Grid;
