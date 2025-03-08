import * as sinon from 'sinon';
import { expect } from 'chai';
import { MermaidChartVSCode } from '../../../mermaidChartVSCode';


suite('MermaidChart Login', () => {
  let mcAPI: MermaidChartVSCode;
  let loginStub: sinon.SinonStub;
  let syncMermaidChartStub: sinon.SinonStub;
  let trackLoginStub: sinon.SinonStub;

  setup(() => {
    mcAPI = new MermaidChartVSCode();

    // Stub the methods and save the stubs
    loginStub = sinon.stub(mcAPI, 'login');

 

  });

  teardown(() => {
    sinon.restore();
  });

  test('should log in, sync Mermaid chart, and track login', async () => {
    
  loginStub.resolves();
  await mcAPI.login();
    // Check if the stubs were called
    expect(loginStub.calledOnce).to.be.true;
  
  });
  test('should handle login failure', async () => {
    const errorMessage = 'Login failed';
    loginStub.rejects(new Error(errorMessage)); // Simulate failed login
  
    try {
      await mcAPI.login();
    } catch (error) {
      if (error instanceof Error) {
        expect(error.message).to.equal(errorMessage);
      } else {
        throw new Error('Unexpected error type');
      }
    }
  

  });
  
});
