import React from 'react';

class Home extends React.Component {

  render() {

    return (
      <>
        <h1>home page</h1>
        {this.props.resorts.map((resort, index) => {
          return (
            <h2 key={index}>{resort.name}</h2>
          )
        })}
      </>
    );
  }
}
export default Home;
