from validatish import Validator

class Remote(Validator):

    def __init__(self, validator_name, message=None):
        self.message = message
        self.validator_name = validator_name

    def __call__(self, v):
        print("Doesn't reach here.")