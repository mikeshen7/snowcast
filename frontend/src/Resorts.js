import React from 'react';
import axios from 'axios';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import './Resorts.css';
import { Next } from 'react-bootstrap/esm/PageItem';

class Resorts extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      validated: false,
      formName: '',
      formLat: '',
      formLon: '',
      formUtc: '',
    }
  }

  componentDidMount() {
    this.props.getResorts();
  }

  handleNameInput = (event) => {
    event.preventDefault();
    this.setState({
      formName: event.target.value,
    })
  }

  handleLatInput = (event) => {
    event.preventDefault();
    this.setState({
      formLat: +event.target.value,
    })
  }

  handleLonInput = (event) => {
    event.preventDefault();
    this.setState({
      formLon: +event.target.value,
    })
  }

  handleUtcInput = (event) => {
    event.preventDefault();
    this.setState({
      formUtc: +event.target.value,
    })
  }

  handleAddResort = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;

    if (form.checkValidity() === true) {
      this.setState({
        validated: true,
      });
    } else {
      event.stopPropagation();
    }

    let validData = false;

    if (typeof (this.state.formName) === 'string' &&
      typeof (this.state.formLat) === 'number' &&
      typeof (this.state.formLon) === 'number') {
      validData = true;
    };

    // If form is incomplete, stop function here.
    if (validData === false) return false;

    let newResort = {
      name: this.state.formName,
      lat: this.state.formLat,
      lon: this.state.formLon,
      utc: this.state.formUtc,
    }

    this.setState({
      validated: false,
      formName: '',
      formLat: '',
      formLon: '',
      formUtc: '',
    })

    try {
      let config = {
        method: 'POST',
        url: `${process.env.REACT_APP_SERVER}/resorts`,
        data: newResort,
      }

      await axios(config);

      this.props.getResorts();

    } catch (error) {
      console.log(error.message);
    }
  }

  handleUpdateResort = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;

    if (form.checkValidity() === true) {
      this.setState({
        validated: true,
      });
    } else {
      event.stopPropagation();
    }

    let validData = false;

    if (typeof (this.state.formName) === 'string' &&
      typeof (this.state.formLat) === 'number' &&
      typeof (this.state.formLon) === 'number') {
      validData = true;
    };

    // If form is incomplete, stop function here.
    if (validData === false) return false;

    let updatedResort = this.state.selectedResort;
    console.log(updatedResort);

    let newResort = {
      name: this.state.formName,
      lat: this.state.formLat,
      lon: this.state.formLon,
    }

    try {
      let config = {
        method: 'POST',
        url: `${process.env.REACT_APP_SERVER}/resorts`,
        data: newResort,
      }

      await axios(config);

      this.props.getResorts();

    } catch (error) {
      console.log(error.message);
    }
  }

  deleteResort = async (resortName) => {
    try {
      let config = {
        method: 'DELETE',
        url: `${process.env.REACT_APP_SERVER}/resorts/${resortName}`,
      }

      await axios(config);

      this.props.getResorts();

    } catch (error) {
      console.log(error.message);
      Next(error);
    }
  }

  render() {
    return (
      <>
        <div className="router-body">

          <Form
            noValidate validated={this.state.validated}
            className='resort-form'>
            <Form.Label>Ski Resort Form</Form.Label>
            <Form.Group controlId="name" className='form-input'>
              <Form.Label>Resort Name</Form.Label>
              <Form.Control type='text' value={this.state.formName} placeholder='Resort Name' required onChange={this.handleNameInput}></Form.Control>
              <Form.Control.Feedback type="invalid">Please enter in the Resort Name</Form.Control.Feedback>
            </Form.Group>

            <Form.Group controlId="lat" className='form-input'>
              <Form.Label>Latitude</Form.Label>
              <Form.Control type='number' value={this.state.formLat} placeholder='47' required onChange={this.handleLatInput}></Form.Control>
              <Form.Control.Feedback type="invalid">Please enter in the latitude</Form.Control.Feedback>
            </Form.Group>

            <Form.Group controlId="lon" className='form-input'>
              <Form.Label>Longitude</Form.Label>
              <Form.Control type='number' value={this.state.formLon} placeholder='-122' required onChange={this.handleLonInput}></Form.Control>
              <Form.Control.Feedback type="invalid">Please enter in the longitude</Form.Control.Feedback>
            </Form.Group>

            <Form.Group controlId="UTC" className='form-input'>
              <Form.Label>UTC Offset</Form.Label>
              <Form.Control type='number' value={this.state.formUtc} placeholder='-8' required onChange={this.handleUtcInput}></Form.Control>
              <Form.Control.Feedback type="invalid">Please enter in the UTC</Form.Control.Feedback>
            </Form.Group>


            <Button type='submit' id="submit-button" onClick={this.handleAddResort}>Add</Button>
          </Form>

          <div className='resorts-table'>
            <tr className='resorts-row'>
              <th className='resorts-cell'>Resort Name</th>
              <th className='resorts-cell'>Latitude</th>
              <th className='resorts-cell'>Longitude</th>
              <th className='resorts-cell'>UTC</th>
              <th className='resorts-cell'>Delete</th>
            </tr>
            <div className='table-scrollable'>
              {this.props.resorts.map((resort, index) => {
                return (
                  <tr className='resorts-row' key={index}>
                    <td className='resorts-cell'>{resort.name}</td>
                    <td className='resorts-cell'>{resort.lat}</td>
                    <td className='resorts-cell'>{resort.lon}</td>
                    <td className='resorts-cell'>{resort.utc}</td>
                    <td className='resorts-cell'><Button type='submit' onClick={() => this.deleteResort(resort.name)}>Delete</Button></td>
                  </tr>
                )
              })}
            </div>
          </div>
        </div >
      </>
    );
  }
}

export default Resorts;
