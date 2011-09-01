from validatish import Validator

class RemoteMethod(Validator):

    def __init__(self, remote_method, message=None):
        self.message = message
        self.remote_method = remote_method

    def __call__(self, v):
        print("Doesn't reach here.")
