import React from 'react';
import { Navbar, NavItem } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import './Header.css';

class Header extends React.Component {
  render() {
    return (
      <>
        <header>
          <Navbar collapseOnSelect expand="lg" bg="dark">
            <NavItem><Link to="/" className="nav-link">Home</Link></NavItem>
            <NavItem><Link to="/Hourly" className="nav-link">Hourly</Link></NavItem>
            <NavItem><Link to="/Daily" className="nav-link">Daily</Link></NavItem>
            {/* <NavItem><Link to="/Grid" className="nav-link">Grid</Link></NavItem> */}
            <NavItem><Link to="/Resorts" className="nav-link">Resorts</Link></NavItem>
          </Navbar>
        </header>
      </>
    );
  }
}

export default Header;
